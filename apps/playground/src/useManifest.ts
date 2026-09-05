import { useEffect, useState } from 'react';
import type { AnimalCatalog, CharacterCatalog, ItemCatalog, ManifestIndex } from 'zomboid-models';

export interface ManifestState {
  manifest: CharacterCatalog | undefined;
  animals: AnimalCatalog | undefined;
  items: ItemCatalog | undefined;
  index: ManifestIndex | undefined;
  error: string | undefined;
}

const EMPTY: ManifestState = {
  manifest: undefined,
  animals: undefined,
  items: undefined,
  index: undefined,
  error: undefined,
};

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

/** Loads the manifest index and the catalogs of an asset folder, for the pickers. */
export function useManifest(assetBaseUrl: string): ManifestState {
  const [state, setState] = useState<ManifestState>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    setState(EMPTY);
    (async () => {
      const index = (await fetchJson(`${assetBaseUrl}manifest.json`)) as ManifestIndex;
      if (index.version !== 2) {
        throw new Error(`manifest version ${String(index.version)}; rebuild the assets`);
      }
      const load = async <T>(file: string | undefined): Promise<T | undefined> =>
        file ? ((await fetchJson(`${assetBaseUrl}${file}`)) as T) : undefined;
      const manifest = await load<CharacterCatalog>(index.catalogs.characters);
      const animals = await load<AnimalCatalog>(index.catalogs.animals);
      const items = await load<ItemCatalog>(index.catalogs.items);
      if (!manifest && !animals && !items) throw new Error('the asset folder has no catalogs');
      if (!cancelled) setState({ manifest, animals, items, index, error: undefined });
    })().catch((error: unknown) => {
      if (!cancelled) {
        setState({ ...EMPTY, error: error instanceof Error ? error.message : String(error) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [assetBaseUrl]);

  return state;
}
