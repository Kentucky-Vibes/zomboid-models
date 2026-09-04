import { useState } from 'react';
import { ATTRIBUTION_TEXT, type CameraOptions, type CharacterDescription } from 'zomboid-models';

import { CharacterView } from './CharacterView.js';
import { OutfitEditor } from './OutfitEditor.js';
import { useManifest } from './useManifest.js';

const DEFAULT_ASSET_BASE_URL = `${import.meta.env.BASE_URL}dev-assets/`;
const ASSET_URL_STORAGE_KEY = 'zomboid-models.playground.assets';

function withTrailingSlash(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

/** The asset folder comes from `?assets=`, then from the last value entered, then the dev folder. */
function initialAssetBaseUrl(): string {
  const fromQuery = new URLSearchParams(window.location.search).get('assets');
  if (fromQuery) return withTrailingSlash(fromQuery);
  try {
    const stored = window.localStorage.getItem(ASSET_URL_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // storage may be unavailable; fall through to the default
  }
  return DEFAULT_ASSET_BASE_URL;
}

function rememberAssetBaseUrl(url: string): void {
  try {
    if (url === DEFAULT_ASSET_BASE_URL) window.localStorage.removeItem(ASSET_URL_STORAGE_KEY);
    else window.localStorage.setItem(ASSET_URL_STORAGE_KEY, url);
  } catch {
    // ignore storage failures
  }
}

const INITIAL_CHARACTER: CharacterDescription = {
  format: 'zomboid-models/character',
  version: 1,
  body: { sex: 'male', skin: 0, hair: 'CrewCut', hairColor: { r: 0.29, g: 0.18, b: 0.1 } },
  worn: [
    { item: 'Base.Trousers_Denim', textureChoice: 0 },
    { item: 'Base.Tshirt_WhiteTINT' },
    { item: 'Base.Jacket_Police' },
    { item: 'Base.Hat_BaseballCap_Police' },
  ],
  held: { primary: { item: 'Base.Axe' } },
};

const CAMERA_PRESETS: Record<string, CameraOptions> = {
  full: {},
  head: { distance: 0.8, targetHeight: 0.86, fov: 22, yaw: 0, pitch: 4 },
  back: { yaw: 180 },
  headBack: { distance: 0.8, targetHeight: 0.86, fov: 22, yaw: 180, pitch: 4 },
};

export function App() {
  const [assetBaseUrl, setAssetBaseUrl] = useState(initialAssetBaseUrl);
  const [assetDraft, setAssetDraft] = useState(assetBaseUrl);
  const { manifest, error } = useManifest(assetBaseUrl);
  const [character, setCharacter] = useState<CharacterDescription>(INITIAL_CHARACTER);
  const [animation, setAnimation] = useState<string | null | undefined>(undefined);
  const [preset, setPreset] = useState('full');

  const applyAssetDraft = () => {
    const next = withTrailingSlash(assetDraft);
    setAssetDraft(next);
    if (next !== assetBaseUrl) {
      rememberAssetBaseUrl(next);
      setAssetBaseUrl(next);
    }
  };

  return (
    <main
      style={{
        padding: 16,
        fontFamily: 'sans-serif',
        color: '#eee',
        background: '#151517',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>zomboid-models playground</h1>
      <label style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
        Asset folder URL:{' '}
        <input
          type="url"
          value={assetDraft}
          size={48}
          onChange={(e) => setAssetDraft(e.target.value)}
          onBlur={applyAssetDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyAssetDraft();
          }}
        />
      </label>
      {error && (
        <p style={{ color: '#f66', fontSize: 13 }}>
          manifest: {error}. Build a folder with <code>zomboid-models build</code> and enter its URL
          above; a folder on another origin needs CORS headers.
        </p>
      )}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div>
          <label style={{ fontSize: 12 }}>
            Animation:{' '}
            <select
              value={animation === undefined ? 'auto' : (animation ?? 'none')}
              onChange={(e) =>
                setAnimation(
                  e.target.value === 'auto'
                    ? undefined
                    : e.target.value === 'none'
                      ? null
                      : e.target.value,
                )
              }
            >
              <option value="auto">auto (by held item)</option>
              <option value="none">bind pose</option>
              {Object.keys(manifest?.animations ?? { Bob_Idle: null }).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>{' '}
          <label style={{ fontSize: 12 }}>
            Camera:{' '}
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {Object.keys(CAMERA_PRESETS).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <CharacterView
              assetBaseUrl={assetBaseUrl}
              mode="viewer"
              character={character}
              animation={animation}
              camera={CAMERA_PRESETS[preset] ?? {}}
              width={420}
              height={600}
            />
            <CharacterView
              assetBaseUrl={assetBaseUrl}
              mode="showcase"
              character={character}
              animation={animation}
              camera={CAMERA_PRESETS[preset] ?? {}}
              width={260}
              height={360}
            />
          </div>
        </div>
        {manifest && (
          <OutfitEditor manifest={manifest} character={character} onChange={setCharacter} />
        )}
      </div>
      <details style={{ marginTop: 12, fontSize: 12 }}>
        <summary>character JSON</summary>
        <pre style={{ fontSize: 11 }}>{JSON.stringify(character, null, 2)}</pre>
      </details>
      <footer style={{ marginTop: 12, fontSize: 11, opacity: 0.7 }}>{ATTRIBUTION_TEXT}</footer>
    </main>
  );
}
