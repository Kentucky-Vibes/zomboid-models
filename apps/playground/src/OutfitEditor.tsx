import { useMemo, useState } from 'react';
import {
  BODY_PARTS,
  type BodyPart,
  type CharacterDescription,
  type Manifest,
  type Sex,
  type WornItemDescription,
} from 'zomboid-models';

export interface OutfitEditorProps {
  manifest: Manifest;
  character: CharacterDescription;
  onChange: (character: CharacterDescription) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Pickers for the body, hair, beard, and worn items, driven by the manifest. */
export function OutfitEditor({ manifest, character, onChange }: OutfitEditorProps) {
  const [filter, setFilter] = useState('');
  const sex: Sex = character.body.sex;
  const worn = character.worn ?? [];

  const wearables = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return Object.entries(manifest.wearables)
      .filter(([type, wearable]) => {
        const clothing = manifest.clothingItems[wearable.clothingItem];
        if (!clothing?.model?.[sex]) return false;
        return (
          needle.length === 0 ||
          type.toLowerCase().includes(needle) ||
          wearable.bodyLocation.includes(needle)
        );
      })
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 60);
  }, [manifest, sex, filter]);

  const update = (patch: Partial<CharacterDescription>): void =>
    onChange({ ...character, ...patch });
  const updateBody = (patch: Partial<CharacterDescription['body']>): void =>
    update({ body: { ...character.body, ...patch } });

  const setWorn = (items: WornItemDescription[]): void => update({ worn: items });
  const toggle = (type: string): void => {
    const index = worn.findIndex((w) => w.item === type);
    setWorn(index < 0 ? [...worn, { item: type }] : worn.filter((_, i) => i !== index));
  };
  const setTextureChoice = (type: string, textureChoice: number): void =>
    setWorn(worn.map((w) => (w.item === type ? { ...w, textureChoice } : w)));

  const hairStyles = Object.keys(manifest.hair[sex]).sort();
  const beards = Object.keys(manifest.beards).sort();
  const skins = manifest.bodies[sex].skins;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 320, fontSize: 12 }}>
      <Field label="Sex">
        <select
          value={sex}
          onChange={(e) =>
            update({ body: { ...character.body, sex: e.target.value as Sex }, worn: [] })
          }
        >
          <option value="male">male</option>
          <option value="female">female</option>
        </select>
      </Field>
      <Field label={`Skin (${skins.length})`}>
        <select
          value={character.body.skin ?? 0}
          onChange={(e) => updateBody({ skin: Number(e.target.value) })}
        >
          {skins.map((key, i) => (
            <option key={key} value={i}>
              {key}
            </option>
          ))}
        </select>
      </Field>
      {sex === 'male' && (
        <label style={{ fontSize: 12 }}>
          <input
            type="checkbox"
            checked={character.body.bodyHair ?? false}
            onChange={(e) => updateBody({ bodyHair: e.target.checked })}
          />{' '}
          body hair
        </label>
      )}
      <Field label="Hair">
        <select
          value={character.body.hair ?? ''}
          onChange={(e) => {
            const rest = without(character.body, 'hair');
            update({ body: e.target.value === '' ? rest : { ...rest, hair: e.target.value } });
          }}
        >
          <option value="">none</option>
          {hairStyles.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Beard">
        <select
          value={character.body.beard ?? ''}
          onChange={(e) => {
            const rest = without(character.body, 'beard');
            update({ body: e.target.value === '' ? rest : { ...rest, beard: e.target.value } });
          }}
        >
          <option value="">none</option>
          {beards.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Hair colour">
        <input
          type="color"
          value={toHex(character.body.hairColor)}
          onChange={(e) => updateBody({ hairColor: fromHex(e.target.value) })}
        />
      </Field>
      <Field label="Worn items">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {worn.map((w) => {
            const clothing = manifest.clothingItems[manifest.wearables[w.item]?.clothingItem ?? ''];
            const choices = clothing
              ? clothing.textures.length > 0
                ? clothing.textures
                : clothing.baseTextures
              : [];
            return (
              <div key={w.item} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button type="button" onClick={() => toggle(w.item)} title="remove">
                  ×
                </button>
                <span style={{ flex: 1 }}>{w.item}</span>
                {choices.length > 1 && (
                  <select
                    value={w.textureChoice ?? 0}
                    onChange={(e) => setTextureChoice(w.item, Number(e.target.value))}
                  >
                    {choices.map((key, i) => (
                      <option key={key} value={i}>
                        {key.split('/').pop()}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </Field>
      <Field label="Blood on the body (all parts)">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={character.body.blood?.Head ?? 0}
          onChange={(e) => {
            const amount = Number(e.target.value);
            const rest = without(character.body, 'blood');
            update({
              body: amount === 0 ? rest : { ...rest, blood: allParts(amount) },
            });
          }}
        />
      </Field>
      <Field label="Blood on worn items (all parts) and a hole in the chest">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={worn[0]?.blood?.Head ?? 0}
            onChange={(e) => {
              const amount = Number(e.target.value);
              setWorn(
                worn.map((w) => {
                  const rest = without(w, 'blood');
                  return amount === 0 ? rest : { ...rest, blood: allParts(amount) };
                }),
              );
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={worn.some((w) => w.holes?.Torso_Upper === true)}
              onChange={(e) =>
                setWorn(
                  worn.map((w) => {
                    const rest = without(w, 'holes');
                    return e.target.checked ? { ...rest, holes: { Torso_Upper: true } } : rest;
                  }),
                )
              }
            />{' '}
            hole
          </label>
        </div>
      </Field>
      {(['primary', 'secondary'] as const).map((hand) => (
        <Field key={hand} label={`${hand} hand`}>
          <HeldItemPicker
            manifest={manifest}
            value={character.held?.[hand]?.item}
            onChange={(item) => {
              const held = { ...character.held };
              if (item === undefined) delete held[hand];
              else held[hand] = { item };
              update({ held });
            }}
          />
        </Field>
      ))}
      <Field label="Add item (filter by type or location)">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="e.g. hat, jacket, base:pants"
        />
      </Field>
      <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #444', padding: 4 }}>
        {wearables.map(([type, wearable]) => (
          <div key={type} style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={() => toggle(type)}
              disabled={worn.some((w) => w.item === type)}
            >
              +
            </button>
            <span>{type}</span>
            <span style={{ opacity: 0.6 }}>{wearable.bodyLocation}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeldItemPicker({
  manifest,
  value,
  onChange,
}: {
  manifest: Manifest;
  value: string | undefined;
  onChange: (item: string | undefined) => void;
}) {
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const matches = useMemo(
    () =>
      Object.entries(manifest.heldItems)
        .filter(([type]) => needle.length > 0 && type.toLowerCase().includes(needle))
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 12),
    [manifest, needle],
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ flex: 1 }}>{value ?? 'nothing'}</span>
        {value !== undefined && (
          <button type="button" onClick={() => onChange(undefined)}>
            ×
          </button>
        )}
      </div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="type to search, e.g. axe"
      />
      {matches.map(([type, held]) => (
        <div key={type} style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={() => {
              onChange(type);
              setFilter('');
            }}
          >
            +
          </button>
          <span>{type}</span>
          <span style={{ opacity: 0.6 }}>{held.weaponType}</span>
        </div>
      ))}
    </div>
  );
}

function allParts(amount: number): Partial<Record<BodyPart, number>> {
  const amounts: Partial<Record<BodyPart, number>> = {};
  for (const part of BODY_PARTS) amounts[part] = amount;
  return amounts;
}

function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy: Partial<T> = { ...value };
  delete copy[key];
  return copy as Omit<T, K>;
}

function toHex(color: CharacterDescription['body']['hairColor']): string {
  if (!color) return '#4a2f1b';
  const channel = (v: number): string =>
    Math.round(Math.min(Math.max(v, 0), 1) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

function fromHex(hex: string): { r: number; g: number; b: number } {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
}
