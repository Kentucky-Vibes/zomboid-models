import { useEffect, useState } from 'react';
import type { Manifest } from 'zomboid-models';

export interface ManifestState {
  manifest: Manifest | undefined;
  error: string | undefined;
}

/** Loads the manifest of an asset folder once, for the pickers of the playground. */
export function useManifest(assetBaseUrl: string): ManifestState {
  const [state, setState] = useState<ManifestState>({ manifest: undefined, error: undefined });

  useEffect(() => {
    let cancelled = false;
    setState({ manifest: undefined, error: undefined });
    fetch(`${assetBaseUrl}manifest.json`, { cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return (await response.json()) as Manifest;
      })
      .then((manifest) => {
        if (!cancelled) setState({ manifest, error: undefined });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            manifest: undefined,
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
