import { useState } from 'react';
import {
  ANIMAL_FORMAT,
  ATTRIBUTION_TEXT,
  ITEM_FORMAT,
  validateAnimalDescription,
  validateCharacterDescription,
  validateItemDescription,
  type AnimalDescription,
  type CameraOptions,
  type CharacterDescription,
  type ItemDescription,
  type ViewerDocument,
} from 'zomboid-models';

import { AnimalEditor } from './AnimalEditor.js';
import { CharacterView } from './CharacterView.js';
import { ItemEditor } from './ItemEditor.js';
import { OutfitEditor } from './OutfitEditor.js';
import { useManifest } from './useManifest.js';

type Subject = 'character' | 'animal' | 'item';

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

const CAMERA_PRESETS: Record<string, CameraOptions> = {
  full: {},
  head: { distance: 0.8, targetHeight: 0.86, fov: 22, yaw: 0, pitch: 4 },
  back: { yaw: 180 },
  headBack: { distance: 0.8, targetHeight: 0.86, fov: 22, yaw: 180, pitch: 4 },
};

export function App() {
  const [assetBaseUrl, setAssetBaseUrl] = useState(initialAssetBaseUrl);
  const [assetDraft, setAssetDraft] = useState(assetBaseUrl);
  const { manifest, animals, items, error } = useManifest(assetBaseUrl);
  const [subject, setSubject] = useState<Subject>('character');
  const [character, setCharacter] = useState<CharacterDescription>(INITIAL_CHARACTER);
  const [animal, setAnimal] = useState<AnimalDescription>(INITIAL_ANIMAL);
  const [item, setItem] = useState<ItemDescription>(INITIAL_ITEM);
  const [animation, setAnimation] = useState<string | null | undefined>(undefined);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [preset, setPreset] = useState('full');
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonError, setJsonError] = useState<string | undefined>(undefined);
  const document: ViewerDocument =
    subject === 'animal' ? animal : subject === 'item' ? item : character;
  const clipNames = Object.keys(
    (subject === 'animal' ? animals?.animations : manifest?.animations) ?? {},
  );

  const importJson = (): void => {
    try {
      const parsed = JSON.parse(jsonDraft) as { format?: unknown };
      if (parsed.format === ITEM_FORMAT) {
        const result = validateItemDescription(parsed);
        if (!result.ok) {
          setJsonError(result.errors.join('; '));
          return;
        }
        setItem(result.value);
        setSubject('item');
      } else if (parsed.format === ANIMAL_FORMAT) {
        const result = validateAnimalDescription(parsed);
        if (!result.ok) {
          setJsonError(result.errors.join('; '));
          return;
        }
        setAnimal(result.value);
        setSubject('animal');
      } else {
        const result = validateCharacterDescription(parsed);
        if (!result.ok) {
          setJsonError(result.errors.join('; '));
          return;
        }
        setCharacter(result.value);
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
              width={420}
              height={600}
            />
            <CharacterView
              assetBaseUrl={assetBaseUrl}
              mode="showcase"
              document={document}
              animation={animation}
              animationSpeed={animationSpeed}
              camera={CAMERA_PRESETS[preset] ?? {}}
              width={260}
              height={360}
            />
          </div>
        </div>
        {subject === 'character' && manifest && (
          <OutfitEditor manifest={manifest} character={character} onChange={setCharacter} />
        )}
        {subject === 'animal' && animals && (
          <AnimalEditor catalog={animals} animal={animal} onChange={setAnimal} />
        )}
        {subject === 'item' && items && (
          <ItemEditor catalog={items} item={item} onChange={setItem} />
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
          placeholder="Paste a character or animal document and press Apply"
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
