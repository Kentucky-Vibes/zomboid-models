/**
 * Reader for the game's vehicle scripts (`vehicle X { }` and `template vehicle X { }` blocks),
 * following `VehicleScript.Load`: `template! = X` loads the template's body into the vehicle in
 * place, `template = X` copies the parts and wheels of a loaded template, `template = X/part/Y`
 * copies one part, `part Tire* { }` applies to every part that matches, and parts, models,
 * skins, and wheels merge by id. Only what the renderer needs is kept.
 */
import type { ScriptBlock, ScriptEntry } from './scripts.js';

export type Vec3 = [number, number, number];

export interface VehicleScriptModel {
  /** The `model` block's name, when it has one (`Default`, `InflatedTirePlusWheel`). */
  id: string | undefined;
  /** Model script name the block's `file` names. */
  file: string | undefined;
  scale: number;
  offset: Vec3;
  rotate: Vec3;
  attachmentParent: string | undefined;
  attachmentSelf: string | undefined;
  ignoreVehicleScale: boolean;
}

export interface VehicleScriptWheel {
  id: string;
  front: boolean;
  offset: Vec3;
  radius: number;
  width: number;
}

/** Texture references of a skin or of the vehicle itself, as written in the script. */
export interface VehicleScriptSkin {
  texture?: string;
  textureRust?: string;
  textureMask?: string;
  textureLights?: string;
  textureDamage1Overlay?: string;
  textureDamage1Shell?: string;
  textureDamage2Overlay?: string;
  textureDamage2Shell?: string;
}

const SKIN_KEYS: readonly (keyof VehicleScriptSkin)[] = [
  'texture',
  'textureRust',
  'textureMask',
  'textureLights',
  'textureDamage1Overlay',
  'textureDamage1Shell',
  'textureDamage2Overlay',
  'textureDamage2Shell',
];

export interface VehicleScriptPassenger {
  id: string;
  /** The `inside` position offset, in script units. */
  inside: Vec3 | undefined;
}

export interface VehicleScriptPart {
  id: string;
  parent: string | undefined;
  wheel: string | undefined;
  area: string | undefined;
  category: string | undefined;
  models: VehicleScriptModel[];
  door: boolean;
  window: boolean;
  hasLightsRear: boolean;
}

export interface VehicleScript {
  /** `Module.Name`. */
  fullName: string;
  module: string;
  name: string;
  /** `game` or the id of the mod whose file defined the vehicle last. */
  source: string;
  /** The vehicle's own `model` blocks; the first one is the body. */
  models: VehicleScriptModel[];
  /** The vehicle-level texture references, which skins fall back to. */
  textures: VehicleScriptSkin;
  skins: VehicleScriptSkin[];
  wheels: VehicleScriptWheel[];
  parts: VehicleScriptPart[];
  passengers: VehicleScriptPassenger[];
  extents: Vec3;
  forcedColor: { hue: number; saturation: number; value: number } | undefined;
  lightbar: boolean;
  carModelName: string | undefined;
}

export function emptyVehicleScript(module: string, name: string, source: string): VehicleScript {
  return {
    fullName: `${module}.${name}`,
    module,
    name,
    source,
    models: [],
    textures: {},
    skins: [],
    wheels: [],
    parts: [],
    passengers: [],
    extents: [1, 1, 1],
    forcedColor: undefined,
    lightbar: false,
    carModelName: undefined,
  };
}

function vector(value: string, fallback: Vec3): Vec3 {
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return fallback;
  return [parts[0] as number, parts[1] as number, parts[2] as number];
}

function number(value: string, fallback: number): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonEmpty(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function copyModel(model: VehicleScriptModel): VehicleScriptModel {
  return { ...model, offset: [...model.offset], rotate: [...model.rotate] };
}

function copyPart(part: VehicleScriptPart): VehicleScriptPart {
  return { ...part, models: part.models.map(copyModel) };
}

/** `VehicleScript.globMatch`: `*` matches anything, the rest is literal, whole id only. */
export function globMatch(pattern: string, id: string): boolean {
  const source = pattern
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`).test(id);
}

/** The entries and child blocks of a block in the order they appear in the file. */
function elementsInOrder(
  block: ScriptBlock,
): ({ entry: ScriptEntry; block?: undefined } | { block: ScriptBlock; entry?: undefined })[] {
  const elements: ({ line: number; entry: ScriptEntry } | { line: number; block: ScriptBlock })[] =
    [
      ...block.entries.map((entry) => ({ line: entry.line, entry })),
      ...block.blocks.map((child) => ({ line: child.line, block: child })),
    ];
  return elements.sort((a, b) => a.line - b.line);
}

/**
 * Loads vehicle scripts from parsed blocks. Templates from every file are registered first,
 * then the vehicles are loaded in file order, so a template may live in any file.
 */
export class VehicleScriptLoader {
  private readonly templates = new Map<string, ScriptBlock>();
  private readonly templateScripts = new Map<string, VehicleScript>();
  readonly vehicles = new Map<string, VehicleScript>();
  readonly warnings: string[] = [];

  /** Registers a `template vehicle X { }` block; a later one with the same name replaces it. */
  addTemplate(block: ScriptBlock): void {
    const name = block.name.replace(/^vehicle\s+/, '').trim();
    if (name.length === 0) return;
    this.templates.set(name, block);
    this.templateScripts.delete(name);
  }

  /** Loads a `vehicle X { }` block into the vehicle of that name, creating it on first sight. */
  addVehicle(module: string, block: ScriptBlock, source: string): VehicleScript {
    const fullName = `${module}.${block.name}`;
    let script = this.vehicles.get(fullName);
    if (!script) {
      script = emptyVehicleScript(module, block.name, source);
      this.vehicles.set(fullName, script);
    }
    script.source = source;
    this.loadInto(script, block);
    return script;
  }

  private template(name: string): ScriptBlock | undefined {
    const exact = this.templates.get(name);
    if (exact) return exact;
    const lower = name.toLowerCase();
    for (const [key, block] of this.templates) if (key.toLowerCase() === lower) return block;
    return undefined;
  }

  /** The template's body loaded as a script of its own, for `template = X` copies. */
  private templateScript(name: string): VehicleScript | undefined {
    const cached = this.templateScripts.get(name);
    if (cached) return cached;
    const block = this.template(name);
    if (!block) return undefined;
    const script = emptyVehicleScript('Base', name, 'template');
    this.templateScripts.set(name, script);
    this.loadInto(script, block);
    return script;
  }

  private loadInto(script: VehicleScript, block: ScriptBlock): void {
    for (const element of elementsInOrder(block)) {
      if (element.entry) this.loadEntry(script, element.entry);
      else this.loadBlock(script, element.block);
    }
  }

  private loadEntry(script: VehicleScript, entry: ScriptEntry): void {
    const key = entry.key;
    const value = entry.value;
    if (key === 'template!') {
      const template = this.template(value.trim());
      if (!template) {
        this.warnings.push(`${script.fullName}: template "${value.trim()}" not found`);
        return;
      }
      this.loadInto(script, template);
    } else if (key === 'template') {
      this.loadTemplate(script, value);
    } else if (key === 'extents') {
      script.extents = vector(value, script.extents);
    } else if (key === 'forcedColor') {
      const [hue, saturation, value2] = vector(value, [-1, -1, -1]);
      script.forcedColor = { hue, saturation, value: value2 };
    } else if (key === 'carModelName') {
      script.carModelName = nonEmpty(value);
    } else if ((SKIN_KEYS as readonly string[]).includes(key) && key !== 'texture') {
      const texture = nonEmpty(value);
      if (texture !== undefined) script.textures[key as keyof VehicleScriptSkin] = texture;
    }
  }

  private loadBlock(script: VehicleScript, block: ScriptBlock): void {
    switch (block.type) {
      case 'model':
        loadModel(block, script.models);
        break;
      case 'part':
        if (block.name.includes('*')) {
          for (const part of [...script.parts]) {
            if (globMatch(block.name, part.id)) loadPart(script, { ...block, name: part.id });
          }
        } else {
          loadPart(script, block);
        }
        break;
      case 'skin': {
        const skin = loadSkin(block);
        if (skin.texture !== undefined) script.skins.push(skin);
        break;
      }
      case 'wheel':
      case 'crawlThroughWheel':
        loadWheel(script, block);
        break;
      case 'passenger':
        if (block.name.includes('*')) {
          for (const passenger of [...script.passengers]) {
            if (globMatch(block.name, passenger.id)) {
              loadPassenger(script, { ...block, name: passenger.id });
            }
          }
        } else {
          loadPassenger(script, block);
        }
        break;
      case 'lightbar':
        script.lightbar = true;
        if (!script.parts.some((p) => p.id === 'lightbar')) {
          script.parts.push(emptyPart('lightbar'));
        }
        break;
      default:
        break;
    }
  }

  /** `VehicleScript.LoadTemplate`: whole templates, or one part or wheel of a template. */
  private loadTemplate(script: VehicleScript, reference: string): void {
    const parts = reference.split('/').map((s) => s.trim());
    if (parts.some((s) => s.length === 0) || parts.length > 3) {
      this.warnings.push(`${script.fullName}: template "${reference}" is malformed`);
      return;
    }
    const name = parts[0] as string;
    const template = this.templateScript(name);
    if (!template) {
      this.warnings.push(`${script.fullName}: template "${name}" not found`);
      return;
    }
    if (parts.length === 1) {
      copyParts(script, template, '*');
      copyPassengers(script, template, '*');
      copyWheels(script, template, '*');
      return;
    }
    const spec = parts[2];
    if (spec === undefined) {
      this.warnings.push(`${script.fullName}: template "${reference}" names no item`);
      return;
    }
    switch (parts[1]) {
      case 'part':
        if (!copyParts(script, template, spec)) {
          this.warnings.push(`${script.fullName}: part "${spec}" not found in template "${name}"`);
        }
        break;
      case 'wheel':
        if (!copyWheels(script, template, spec)) {
          this.warnings.push(`${script.fullName}: wheel "${spec}" not found in template "${name}"`);
        }
        break;
      case 'passenger':
        if (!copyPassengers(script, template, spec)) {
          this.warnings.push(
            `${script.fullName}: passenger "${spec}" not found in template "${name}"`,
          );
        }
        break;
      default:
        // Areas, passengers, and physics do not affect the drawing.
        break;
    }
  }
}

function emptyPart(id: string): VehicleScriptPart {
  return {
    id,
    parent: undefined,
    wheel: undefined,
    area: undefined,
    category: undefined,
    models: [],
    door: false,
    window: false,
    hasLightsRear: false,
  };
}

function loadModel(block: ScriptBlock, models: VehicleScriptModel[]): void {
  const id = nonEmpty(block.name);
  let model = models.find(
    (m) => (m.id === undefined && id === undefined) || (m.id !== undefined && m.id === id),
  );
  if (!model) {
    model = {
      id,
      file: undefined,
      scale: 1,
      offset: [0, 0, 0],
      rotate: [0, 0, 0],
      attachmentParent: undefined,
      attachmentSelf: undefined,
      ignoreVehicleScale: false,
    };
    models.push(model);
  }
  for (const entry of block.entries) {
    switch (entry.key) {
      case 'file':
        model.file = nonEmpty(entry.value);
        break;
      case 'offset':
        model.offset = vector(entry.value, model.offset);
        break;
      case 'rotate':
        model.rotate = vector(entry.value, model.rotate);
        break;
      case 'scale':
        model.scale = number(entry.value, model.scale);
        break;
      case 'attachmentParent':
        model.attachmentParent = nonEmpty(entry.value);
        break;
      case 'attachmentSelf':
        model.attachmentSelf = nonEmpty(entry.value);
        break;
      default:
        if (entry.key.toLowerCase() === 'ignorevehiclescale') {
          model.ignoreVehicleScale = entry.value.trim().toLowerCase() === 'true';
        }
    }
  }
}

function loadPart(script: VehicleScript, block: ScriptBlock): void {
  let part = script.parts.find((p) => p.id === block.name);
  if (!part) {
    part = emptyPart(block.name);
    script.parts.push(part);
  }
  for (const entry of block.entries) {
    switch (entry.key) {
      case 'area':
        part.area = nonEmpty(entry.value);
        break;
      case 'parent':
        part.parent = nonEmpty(entry.value);
        break;
      case 'wheel':
        part.wheel = nonEmpty(entry.value);
        break;
      case 'category':
        part.category = nonEmpty(entry.value);
        break;
      case 'hasLightsRear':
        part.hasLightsRear = entry.value.trim().toLowerCase() === 'true';
        break;
      default:
        break;
    }
  }
  for (const child of block.blocks) {
    if (child.type === 'model') loadModel(child, part.models);
    else if (child.type === 'door') part.door = true;
    else if (child.type === 'window') part.window = true;
  }
}

/** `LoadPassenger`: only the `inside` position matters for drawing. */
function loadPassenger(script: VehicleScript, block: ScriptBlock): void {
  let passenger = script.passengers.find((p) => p.id === block.name);
  if (!passenger) {
    passenger = { id: block.name, inside: undefined };
    script.passengers.push(passenger);
  }
  for (const child of block.blocks) {
    if (child.type !== 'position' || child.name !== 'inside') continue;
    const offset = child.entries.find((e) => e.key === 'offset');
    if (offset) passenger.inside = vector(offset.value, passenger.inside ?? [0, 0, 0]);
  }
}

function copyPassengers(script: VehicleScript, from: VehicleScript, spec: string): boolean {
  const source = spec === '*' ? from.passengers : from.passengers.filter((p) => p.id === spec);
  if (spec !== '*' && source.length === 0) return false;
  for (const passenger of source) {
    const copy = {
      ...passenger,
      inside: passenger.inside ? ([...passenger.inside] as Vec3) : undefined,
    };
    const index = script.passengers.findIndex((p) => p.id === passenger.id);
    if (index < 0) script.passengers.push(copy);
    else script.passengers[index] = copy;
  }
  return true;
}

function loadSkin(block: ScriptBlock): VehicleScriptSkin {
  const skin: VehicleScriptSkin = {};
  for (const entry of block.entries) {
    if ((SKIN_KEYS as readonly string[]).includes(entry.key)) {
      const texture = nonEmpty(entry.value);
      if (texture !== undefined) skin[entry.key as keyof VehicleScriptSkin] = texture;
    }
  }
  return skin;
}

function loadWheel(script: VehicleScript, block: ScriptBlock): void {
  let wheel = script.wheels.find((w) => w.id === block.name);
  if (!wheel) {
    wheel = { id: block.name, front: false, offset: [0, 0, 0], radius: 0.5, width: 0.4 };
    script.wheels.push(wheel);
  }
  for (const entry of block.entries) {
    switch (entry.key) {
      case 'front':
        wheel.front = entry.value.trim().toLowerCase() === 'true';
        break;
      case 'offset':
        wheel.offset = vector(entry.value, wheel.offset);
        break;
      case 'radius':
        wheel.radius = number(entry.value, wheel.radius);
        break;
      case 'width':
        wheel.width = number(entry.value, wheel.width);
        break;
      default:
        break;
    }
  }
}

/** `copyPartsFrom`: replaces parts of the same id, adds the others. Returns false when `spec` names no part. */
function copyParts(script: VehicleScript, from: VehicleScript, spec: string): boolean {
  const source = spec === '*' ? from.parts : from.parts.filter((p) => p.id === spec);
  if (spec !== '*' && source.length === 0) return false;
  for (const part of source) {
    const index = script.parts.findIndex((p) => p.id === part.id);
    if (index < 0) script.parts.push(copyPart(part));
    else script.parts[index] = copyPart(part);
  }
  return true;
}

function copyWheels(script: VehicleScript, from: VehicleScript, spec: string): boolean {
  const source = spec === '*' ? from.wheels : from.wheels.filter((w) => w.id === spec);
  if (spec !== '*' && source.length === 0) return false;
  for (const wheel of source) {
    const copy = { ...wheel, offset: [...wheel.offset] as Vec3 };
    const index = script.wheels.findIndex((w) => w.id === wheel.id);
    if (index < 0) script.wheels.push(copy);
    else script.wheels[index] = copy;
  }
  return true;
}
