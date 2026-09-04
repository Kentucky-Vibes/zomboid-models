import { tokenize, XSyntaxError, type Token } from './tokenizer.js';
import type {
  XAnimation,
  XAnimationKey,
  XAnimationSet,
  XFile,
  XFrame,
  XKeyType,
  XMaterial,
  XMaterialEntry,
  XMaterialList,
  XMesh,
  XSkinHeader,
  XSkinWeights,
} from './types.js';

const KEY_TYPES: ReadonlySet<number> = new Set([0, 1, 2, 4]);

/**
 * Recursive-descent parser for the data section of a text .x file. Template declarations are
 * skipped; object types the converter does not need are skipped with their whole body.
 */
class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parseFile(): XFile {
    const file: XFile = {
      materials: [],
      frames: [],
      meshes: [],
      animationSets: [],
      ticksPerSecond: undefined,
    };
    while (this.index < this.tokens.length) {
      const type = this.expectIdent();
      if (type === 'template') {
        this.skipNamedBody();
        continue;
      }
      this.parseObjectInto(type, file);
    }
    return file;
  }

  private parseObjectInto(type: string, file: XFile): void {
    switch (type) {
      case 'Material':
        file.materials.push(this.parseMaterial());
        break;
      case 'Frame':
        file.frames.push(this.parseFrame());
        break;
      case 'Mesh':
        file.meshes.push(this.parseMesh());
        break;
      case 'AnimTicksPerSecond':
        this.optionalName();
        this.expect('open');
        file.ticksPerSecond = this.readInt();
        this.expect('close');
        break;
      case 'AnimationSet':
        file.animationSets.push(this.parseAnimationSet());
        break;
      default:
        this.skipNamedBody();
    }
  }

  private parseFrame(): XFrame {
    const frame: XFrame = {
      name: this.optionalName(),
      transform: undefined,
      frames: [],
      meshes: [],
    };
    this.expect('open');
    while (!this.atClose()) {
      const type = this.expectIdent();
      switch (type) {
        case 'FrameTransformMatrix':
          this.optionalName();
          this.expect('open');
          frame.transform = this.readFloats(16);
          this.expect('close');
          break;
        case 'Frame':
          frame.frames.push(this.parseFrame());
          break;
        case 'Mesh':
          frame.meshes.push(this.parseMesh());
          break;
        default:
          this.skipNamedBody();
      }
    }
    this.expect('close');
    return frame;
  }

  private parseMesh(): XMesh {
    const mesh: XMesh = {
      name: this.optionalName(),
      positions: [],
      faces: [],
      normals: undefined,
      texCoords: undefined,
      materialList: undefined,
      skinHeader: undefined,
      skinWeights: [],
    };
    this.expect('open');
    const vertexCount = this.readInt();
    mesh.positions = this.readFloats(vertexCount * 3);
    mesh.faces = this.readFaces();
    while (!this.atClose()) {
      const type = this.expectIdent();
      switch (type) {
        case 'MeshNormals': {
          this.optionalName();
          this.expect('open');
          const count = this.readInt();
          const values = this.readFloats(count * 3);
          const faces = this.readFaces();
          this.expect('close');
          mesh.normals = { values, faces };
          break;
        }
        case 'MeshTextureCoords': {
          this.optionalName();
          this.expect('open');
          const count = this.readInt();
          mesh.texCoords = this.readFloats(count * 2);
          this.expect('close');
          break;
        }
        case 'MeshMaterialList':
          mesh.materialList = this.parseMaterialList();
          break;
        case 'XSkinMeshHeader':
          mesh.skinHeader = this.parseSkinHeader();
          break;
        case 'SkinWeights':
          mesh.skinWeights.push(this.parseSkinWeights());
          break;
        default:
          this.skipNamedBody();
      }
    }
    this.expect('close');
    return mesh;
  }

  private readFaces(): number[][] {
    const faceCount = this.readInt();
    const faces: number[][] = [];
    for (let i = 0; i < faceCount; i++) {
      const indexCount = this.readInt();
      if (indexCount < 3) {
        throw new XSyntaxError(`face with ${indexCount} indices`, this.currentLine());
      }
      faces.push(this.readInts(indexCount));
    }
    return faces;
  }

  private parseMaterialList(): XMaterialList {
    this.optionalName();
    this.expect('open');
    const materialCount = this.readInt();
    const faceCount = this.readInt();
    const faceMaterials = this.readInts(faceCount);
    const materials: XMaterialEntry[] = [];
    while (!this.atClose()) {
      if (this.peek().type === 'open') {
        materials.push({ kind: 'ref', name: this.readReference() });
        continue;
      }
      const type = this.expectIdent();
      if (type === 'Material') {
        materials.push({ kind: 'inline', material: this.parseMaterial() });
      } else {
        this.skipNamedBody();
      }
    }
    this.expect('close');
    if (materials.length !== materialCount) {
      throw new XSyntaxError(
        `material list declares ${materialCount} materials but contains ${materials.length}`,
        this.currentLine(),
      );
    }
    return { materials, faceMaterials };
  }

  private parseMaterial(): XMaterial {
    const material: XMaterial = {
      name: this.optionalName(),
      faceColor: [0, 0, 0, 1],
      power: 0,
      specular: [0, 0, 0],
      emissive: [0, 0, 0],
      textureFilename: undefined,
    };
    this.expect('open');
    material.faceColor = this.readFloats(4) as [number, number, number, number];
    material.power = this.readFloat();
    material.specular = this.readFloats(3) as [number, number, number];
    material.emissive = this.readFloats(3) as [number, number, number];
    while (!this.atClose()) {
      const type = this.expectIdent();
      if (type === 'TextureFilename') {
        this.optionalName();
        this.expect('open');
        material.textureFilename = this.readString();
        this.expect('close');
      } else {
        this.skipNamedBody();
      }
    }
    this.expect('close');
    return material;
  }

  private parseSkinHeader(): XSkinHeader {
    this.optionalName();
    this.expect('open');
    const header: XSkinHeader = {
      maxWeightsPerVertex: this.readInt(),
      maxWeightsPerFace: this.readInt(),
      boneCount: this.readInt(),
    };
    this.expect('close');
    return header;
  }

  private parseSkinWeights(): XSkinWeights {
    this.optionalName();
    this.expect('open');
    const bone = this.readString();
    const count = this.readInt();
    const skin: XSkinWeights = {
      bone,
      vertexIndices: this.readInts(count),
      weights: this.readFloats(count),
      offsetMatrix: this.readFloats(16),
    };
    this.expect('close');
    return skin;
  }

  private parseAnimationSet(): XAnimationSet {
    const set: XAnimationSet = { name: this.optionalName(), animations: [] };
    this.expect('open');
    while (!this.atClose()) {
      const type = this.expectIdent();
      if (type === 'Animation') {
        set.animations.push(this.parseAnimation());
      } else {
        this.skipNamedBody();
      }
    }
    this.expect('close');
    return set;
  }

  private parseAnimation(): XAnimation {
    this.optionalName();
    const animation: XAnimation = { target: undefined, keys: [] };
    this.expect('open');
    while (!this.atClose()) {
      if (this.peek().type === 'open') {
        animation.target = this.readReference();
        continue;
      }
      const type = this.expectIdent();
      if (type === 'AnimationKey') {
        animation.keys.push(this.parseAnimationKey());
      } else {
        this.skipNamedBody();
      }
    }
    this.expect('close');
    return animation;
  }

  private parseAnimationKey(): XAnimationKey {
    this.optionalName();
    this.expect('open');
    const keyType = this.readInt();
    if (!KEY_TYPES.has(keyType)) {
      throw new XSyntaxError(`unknown animation key type ${keyType}`, this.currentLine());
    }
    const keyCount = this.readInt();
    const key: XAnimationKey = { keyType: keyType as XKeyType, keys: [] };
    for (let i = 0; i < keyCount; i++) {
      const time = this.readInt();
      const valueCount = this.readInt();
      key.keys.push({ time, values: this.readFloats(valueCount) });
    }
    this.expect('close');
    return key;
  }

  /** Reads `{ Name }`. */
  private readReference(): string {
    this.expect('open');
    const name = this.expectIdent();
    this.expect('close');
    return name;
  }

  /** Skips an optional name and a `{ ... }` body with balanced braces. */
  private skipNamedBody(): void {
    while (this.peek().type !== 'open') {
      this.index++;
      if (this.index >= this.tokens.length) {
        throw new XSyntaxError('unexpected end of file', this.currentLine());
      }
    }
    let depth = 0;
    do {
      const token = this.next();
      if (token.type === 'open') depth++;
      else if (token.type === 'close') depth--;
    } while (depth > 0);
  }

  private optionalName(): string | undefined {
    const token = this.peek();
    if (token.type === 'ident') {
      this.index++;
      return token.text;
    }
    return undefined;
  }

  private atClose(): boolean {
    return this.peek().type === 'close';
  }

  private peek(): Token {
    const token = this.tokens[this.index];
    if (!token) {
      throw new XSyntaxError('unexpected end of file', this.currentLine());
    }
    return token;
  }

  private next(): Token {
    const token = this.peek();
    this.index++;
    return token;
  }

  private currentLine(): number {
    return (this.tokens[Math.min(this.index, this.tokens.length - 1)] ?? { line: 0 }).line;
  }

  private expect(type: 'open' | 'close'): void {
    const token = this.next();
    if (token.type !== type) {
      throw new XSyntaxError(
        `expected "${type === 'open' ? '{' : '}'}" but found "${token.text}"`,
        token.line,
      );
    }
  }

  private expectIdent(): string {
    const token = this.next();
    if (token.type !== 'ident') {
      throw new XSyntaxError(`expected a name but found "${token.text}"`, token.line);
    }
    return token.text;
  }

  private readNumberToken(): Token {
    const token = this.next();
    if (token.type !== 'number') {
      throw new XSyntaxError(`expected a number but found "${token.text}"`, token.line);
    }
    return token;
  }

  private readInt(): number {
    const token = this.readNumberToken();
    const value = Number(token.text);
    if (!Number.isInteger(value)) {
      throw new XSyntaxError(`expected an integer but found "${token.text}"`, token.line);
    }
    return value;
  }

  private readFloat(): number {
    const token = this.readNumberToken();
    const value = Number(token.text);
    if (!Number.isFinite(value)) {
      throw new XSyntaxError(`invalid number "${token.text}"`, token.line);
    }
    return value;
  }

  private readInts(count: number): number[] {
    const values = new Array<number>(count);
    for (let i = 0; i < count; i++) values[i] = this.readInt();
    return values;
  }

  private readFloats(count: number): number[] {
    const values = new Array<number>(count);
    for (let i = 0; i < count; i++) values[i] = this.readFloat();
    return values;
  }

  private readString(): string {
    const token = this.next();
    if (token.type !== 'string') {
      throw new XSyntaxError(`expected a string but found "${token.text}"`, token.line);
    }
    return token.text;
  }
}

/** Parses the text of a .x file into its object model. */
export function parseX(text: string): XFile {
  return new Parser(tokenize(text)).parseFile();
}
