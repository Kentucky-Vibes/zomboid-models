import { useEffect, useState } from 'react';
import type { AnimalCatalog, CharacterCatalog, ManifestIndex } from 'zomboid-models';

export interface ManifestState {
  manifest: CharacterCatalog | undefined;
  animals: AnimalCatalog | undefined;
  index: ManifestIndex | undefined;
  error: string | undefined;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

/** Loads the manifest index and the catalogs of an asset folder, for the pickers. */
export function useManifest(assetBaseUrl: string): ManifestState {
  const [state, setState] = useState<ManifestState>({
    manifest: undefined,
    animals: undefined,
    index: undefined,
    error: undefined,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ manifest: undefined, animals: undefined, index: undefined, error: undefined });
    (async () => {
      const index = (await fetchJson(`${assetBaseUrl}manifest.json`)) as ManifestIndex;
      if (index.version !== 2) {
        throw new Error(`manifest version ${String(index.version)}; rebuild the assets`);
      }
      const characters = index.catalogs.characters;
      const manifest = characters
        ? ((await fetchJson(`${assetBaseUrl}${characters}`)) as CharacterCatalog)
        : undefined;
      const animalsFile = index.catalogs.animals;
      const animals = animalsFile
        ? ((await fetchJson(`${assetBaseUrl}${animalsFile}`)) as AnimalCatalog)
        : undefined;
      if (!manifest && !animals) throw new Error('the asset folder has no catalogs');
      if (!cancelled) setState({ manifest, animals, index, error: undefined });
    })().catch((error: unknown) => {
      if (!cancelled) {
        setState({
          manifest: undefined,
          animals: undefined,
          index: undefined,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [assetBaseUrl]);

  return state;
}
