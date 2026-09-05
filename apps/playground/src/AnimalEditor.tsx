import {
  ANIMAL_STANCES,
  ANIMAL_VARIANTS,
  displayName,
  type AnimalCatalog,
  type AnimalDescription,
  type AnimalStance,
  type AnimalVariant,
  type NamesCatalog,
} from 'zomboid-models';

export interface AnimalEditorProps {
  catalog: AnimalCatalog;
  animal: AnimalDescription;
  onChange: (animal: AnimalDescription) => void;
  names?: NamesCatalog | undefined;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function toHex(color: AnimalDescription['tint']): string {
  const c = color ?? { r: 1, g: 1, b: 1 };
  const hex = (v: number): string =>
    Math.round(Math.min(Math.max(v, 0), 1) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
}

function fromHex(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

/** Pickers for the animal type, breed, texture, body variant, size, tint, hue, and stance. */
export function AnimalEditor({ catalog, animal, onChange, names }: AnimalEditorProps) {
  const types = Object.keys(catalog.animals).sort();
  const definition = catalog.animals[animal.type];
  const breedName = animal.breed ?? definition?.breedOrder[0];
  const breed = breedName === undefined ? undefined : definition?.breeds[breedName];
  const textures =
    breed === undefined
      ? []
      : definition?.baby && breed.texturesBaby.length > 0
        ? breed.texturesBaby
        : definition?.female
          ? breed.textures
          : breed.texturesMale.length > 0
            ? breed.texturesMale
            : breed.textures;
  const update = (patch: Partial<AnimalDescription>): void => onChange({ ...animal, ...patch });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 320, fontSize: 12 }}>
      <Field label={`Type (${types.length})`}>
        <select
          value={animal.type}
          onChange={(e) =>
            onChange({ format: animal.format, version: animal.version, type: e.target.value })
          }
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {names ? `${displayName(names, 'animals', type)} (${type})` : type}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Breed">
        <select
          value={breedName ?? ''}
          onChange={(e) => onChange({ ...without(animal, 'texture'), breed: e.target.value })}
        >
          {(definition?.breedOrder ?? []).map((name) => (
            <option key={name} value={name}>
              {names ? `${displayName(names, 'breeds', name)} (${name})` : name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Texture (${textures.length})`}>
        <select
          value={typeof animal.texture === 'number' ? animal.texture : ''}
          onChange={(e) =>
            onChange(
              e.target.value === ''
                ? without(animal, 'texture')
                : { ...animal, texture: Number(e.target.value) },
            )
          }
        >
          <option value="">seeded</option>
          {textures.map((key, index) => (
            <option key={key} value={index}>
              {key}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Variant">
        <select
          value={animal.variant ?? 'normal'}
          onChange={(e) =>
            onChange(
              e.target.value === 'normal'
                ? without(animal, 'variant')
                : { ...animal, variant: e.target.value as AnimalVariant },
            )
          }
        >
          {ANIMAL_VARIANTS.map((variant) => (
            <option key={variant} value={variant}>
              {variant}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={`Size ${(animal.size ?? definition?.maxSize ?? 1).toFixed(2)} (${definition?.minSize ?? 0} to ${definition?.maxSize ?? 1})`}
      >
        <input
          type="range"
          min={definition?.minSize ?? 0.1}
          max={definition?.maxSize ?? 2}
          step={0.01}
          value={animal.size ?? definition?.maxSize ?? 1}
          onChange={(e) => update({ size: Number(e.target.value) })}
        />
      </Field>
      <Field label="Tint">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="color"
            value={toHex(animal.tint)}
            onChange={(e) => update({ tint: fromHex(e.target.value) })}
          />
          <button type="button" onClick={() => onChange(without(animal, 'tint'))}>
            reset
          </button>
        </div>
      </Field>
      <Field label={`Hue ${(animal.hue ?? 0).toFixed(2)}`}>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={animal.hue ?? 0}
          onChange={(e) =>
            onChange(
              Number(e.target.value) === 0
                ? without(animal, 'hue')
                : { ...animal, hue: Number(e.target.value) },
            )
          }
        />
      </Field>
      <Field label="Stance">
        <select
          value={animal.stance ?? 'standing'}
          onChange={(e) =>
            onChange(
              e.target.value === 'standing'
                ? without(animal, 'stance')
                : { ...animal, stance: e.target.value as AnimalStance },
            )
          }
        >
          {ANIMAL_STANCES.map((stance) => (
            <option key={stance} value={stance}>
              {stance}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Seed">
        <input
          type="number"
          value={animal.seed ?? 0}
          onChange={(e) => update({ seed: Number(e.target.value) })}
        />
      </Field>
    </div>
  );
}
