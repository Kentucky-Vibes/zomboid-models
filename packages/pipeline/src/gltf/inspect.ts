/** What a GLB file holds, read from its JSON chunk without loading the geometry. */
export interface GlbSummary {
  /** Mesh names in file order; an unnamed mesh gets `mesh<index>`. */
  meshes: string[];
  skinned: boolean;
}

const GLB_MAGIC = 0x46546c67;

/** Reads the mesh names and whether skins exist from a GLB's JSON chunk. */
export function describeGlb(data: Uint8Array): GlbSummary {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('not a GLB file');
  }
  const length = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(data.subarray(20, 20 + length))) as {
    meshes?: { name?: string }[];
    skins?: unknown[];
  };
  return {
    meshes: (json.meshes ?? []).map((mesh, index) => mesh.name ?? `mesh${index}`),
    skinned: (json.skins?.length ?? 0) > 0,
  };
}
