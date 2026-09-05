import { useState } from 'react';
import {
  ANIMAL_FORMAT,
  ATTRIBUTION_TEXT,
  ITEM_FORMAT,
  SCENE_FORMAT,
  VEHICLE_FORMAT,
  validateDescription,
  type AnimalDescription,
  type CameraOptions,
  type CharacterDescription,
  type ItemDescription,
  type SceneDescription,
  type VehicleDescription,
  type ViewerDocument,
} from 'zomboid-models';

import { AnimalEditor } from './AnimalEditor.js';
import { CharacterView } from './CharacterView.js';
import { ItemEditor } from './ItemEditor.js';
import { OutfitEditor } from './OutfitEditor.js';
import { SceneEditor } from './SceneEditor.js';
import { useManifest, useNames } from './useManifest.js';
import { VehicleEditor } from './VehicleEditor.js';

type Subject = 'character' | 'animal' | 'item' | 'vehicle' | 'scene';

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

const INITIAL_ANIMAL: AnimalDescription = {
  format: 'zomboid-models/animal',
  version: 1,
  type: 'cow',
  breed: 'holstein',
};

const INITIAL_ITEM: ItemDescription = {
  format: 'zomboid-models/item',
  version: 1,
  item: 'Base.Axe',
};

const INITIAL_VEHICLE: VehicleDescription = {
  format: 'zomboid-models/vehicle',
  version: 1,
  vehicle: 'Base.CarNormal',
};

const INITIAL_SCENE: SceneDescription = {
  format: 'zomboid-models/scene',
  version: 1,
  subjects: [
    { document: { format: 'zomboid-models/vehicle', version: 1, vehicle: 'Base.CarLightsPolice' } },
    { document: INITIAL_CHARACTER, seat: 'FrontLeft', in: 0 },
    {
      document: {
        format: 'zomboid-models/character',
        version: 1,
        body: { sex: 'female', zombie: { seed: 5 } },
        outfit: { name: 'Nurse', seed: 5 },
      },
      position: [3.2, 0.5],
      yaw: -20,
    },
    { document: INITIAL_ANIMAL, position: [-3.4, 0], yaw: 30 },
  ],
  ground: '#3a3b3f',
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
  const { manifest, animals, items, vehicles, index, error } = useManifest(assetBaseUrl);
  const languages = Object.keys(index?.names ?? {});
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const activeLanguage = language ?? languages[0];
  const names = useNames(assetBaseUrl, activeLanguage);
  const [subject, setSubject] = useState<Subject>('character');
  const [character, setCharacter] = useState<CharacterDescription>(INITIAL_CHARACTER);
  const [animal, setAnimal] = useState<AnimalDescription>(INITIAL_ANIMAL);
  const [item, setItem] = useState<ItemDescription>(INITIAL_ITEM);
  const [vehicle, setVehicle] = useState<VehicleDescription>(INITIAL_VEHICLE);
  const [scene, setScene] = useState<SceneDescription>(INITIAL_SCENE);
  const [animation, setAnimation] = useState<string | null | undefined>(undefined);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [preset, setPreset] = useState('full');
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonError, setJsonError] = useState<string | undefined>(undefined);
  const document: ViewerDocument =
    subject === 'animal'
      ? animal
      : subject === 'item'
        ? item
        : subject === 'vehicle'
          ? vehicle
          : subject === 'scene'
            ? scene
            : character;
  const clipNames = Object.keys(
    subject === 'animal'
      ? (animals?.animations ?? {})
      : subject === 'character'
        ? (manifest?.animations ?? {})
        : {},
  );

  const importJson = (): void => {
    try {
      const result = validateDescription(JSON.parse(jsonDraft));
      if (!result.ok) {
        setJsonError(result.errors.join('; '));
        return;
      }
      const value = result.value;
      if (value.format === ITEM_FORMAT) {
        setItem(value);
        setSubject('item');
      } else if (value.format === ANIMAL_FORMAT) {
        setAnimal(value);
        setSubject('animal');
      } else if (value.format === VEHICLE_FORMAT) {
        setVehicle(value);
        setSubject('vehicle');
      } else if (value.format === SCENE_FORMAT) {
        setScene(value);
        setSubject('scene');
      } else {
        setCharacter(value);
        setSubject('character');
      }
      setJsonError(undefined);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  };

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
            Subject:{' '}
            <select
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value as Subject);
                setAnimation(undefined);
              }}
            >
              <option value="character">character</option>
              <option value="animal" disabled={!animals}>
                animal{animals ? '' : ' (no catalog)'}
              </option>
              <option value="item" disabled={!items}>
                item{items ? '' : ' (no catalog)'}
              </option>
              <option value="vehicle" disabled={!vehicles}>
                vehicle{vehicles ? '' : ' (no catalog)'}
              </option>
              <option value="scene">scene</option>
            </select>
          </label>{' '}
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
              <option value="auto">auto (as in the game)</option>
              <option value="none">bind pose</option>
              {clipNames.map((name) => (
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
          </label>{' '}
          {languages.length > 0 && (
            <label style={{ fontSize: 12 }}>
              Names:{' '}
              <select value={activeLanguage ?? ''} onChange={(e) => setLanguage(e.target.value)}>
                {languages.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          )}{' '}
          <label style={{ fontSize: 12 }}>
            Speed:{' '}
            <input
              type="range"
              min={0.1}
              max={3}
              step={0.1}
              value={animationSpeed}
              onChange={(e) => setAnimationSpeed(Number(e.target.value))}
            />{' '}
            {animationSpeed.toFixed(1)}
          </label>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <CharacterView
              assetBaseUrl={assetBaseUrl}
              mode="viewer"
              document={document}
              animation={animation}
              animationSpeed={animationSpeed}
              camera={CAMERA_PRESETS[preset] ?? {}}
              width={subject === 'vehicle' || subject === 'scene' ? 640 : 420}
              height={subject === 'vehicle' || subject === 'scene' ? 420 : 600}
            />
            <CharacterView
              assetBaseUrl={assetBaseUrl}
              mode="showcase"
              document={document}
              animation={animation}
              animationSpeed={animationSpeed}
              camera={CAMERA_PRESETS[preset] ?? {}}
              width={subject === 'vehicle' || subject === 'scene' ? 320 : 260}
              height={subject === 'vehicle' || subject === 'scene' ? 220 : 360}
            />
          </div>
        </div>
        {subject === 'character' && manifest && (
          <OutfitEditor
            manifest={manifest}
            character={character}
            onChange={setCharacter}
            names={names}
          />
        )}
        {subject === 'animal' && animals && (
          <AnimalEditor catalog={animals} animal={animal} onChange={setAnimal} names={names} />
        )}
        {subject === 'item' && items && (
          <ItemEditor catalog={items} item={item} onChange={setItem} names={names} />
        )}
        {subject === 'vehicle' && vehicles && (
          <VehicleEditor catalog={vehicles} vehicle={vehicle} onChange={setVehicle} names={names} />
        )}
        {subject === 'scene' && (
          <SceneEditor
            scene={scene}
            onChange={setScene}
            sources={{ character, animal, item, vehicle }}
            vehicles={vehicles}
            names={names}
          />
        )}
      </div>
      <details style={{ marginTop: 12, fontSize: 12 }}>
        <summary>document JSON</summary>
        <pre style={{ fontSize: 11 }}>{JSON.stringify(document, null, 2)}</pre>
      </details>
      <details style={{ marginTop: 8, fontSize: 12 }}>
        <summary>import JSON</summary>
        <textarea
          rows={8}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 11 }}
          value={jsonDraft}
          onChange={(e) => setJsonDraft(e.target.value)}
          placeholder="Paste a character, animal, item, vehicle, or scene document and press Apply"
        />
        <div>
          <button type="button" onClick={importJson}>
            Apply
          </button>{' '}
          {jsonError && <span style={{ color: '#f66' }}>{jsonError}</span>}
        </div>
      </details>
      <footer style={{ marginTop: 12, fontSize: 11, opacity: 0.7 }}>{ATTRIBUTION_TEXT}</footer>
    </main>
  );
}
