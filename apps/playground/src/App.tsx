import { useState } from 'react';
import { ATTRIBUTION_TEXT, type CameraOptions, type CharacterDescription } from 'zomboid-models';

import { CharacterView } from './CharacterView.js';
import { OutfitEditor } from './OutfitEditor.js';
import { useManifest } from './useManifest.js';

const ASSET_BASE_URL = `${import.meta.env.BASE_URL}dev-assets/`;

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
  const { manifest, error } = useManifest(ASSET_BASE_URL);
  const [character, setCharacter] = useState<CharacterDescription>(INITIAL_CHARACTER);
  const [animation, setAnimation] = useState<string | null | undefined>(undefined);
  const [preset, setPreset] = useState('full');

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
      {error && <p style={{ color: '#f66' }}>manifest: {error}</p>}
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
              assetBaseUrl={ASSET_BASE_URL}
              mode="viewer"
              character={character}
              animation={animation}
              camera={CAMERA_PRESETS[preset] ?? {}}
              width={420}
              height={600}
            />
            <CharacterView
              assetBaseUrl={ASSET_BASE_URL}
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
