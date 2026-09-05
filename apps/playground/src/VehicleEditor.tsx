import { useMemo, useState } from 'react';
import {
  displayName,
  type ManifestVehicle,
  type NamesCatalog,
  type VehicleCatalog,
  type VehicleDescription,
  type VehiclePartState,
} from 'zomboid-models';

export interface VehicleEditorProps {
  catalog: VehicleCatalog;
  vehicle: VehicleDescription;
  onChange: (vehicle: VehicleDescription) => void;
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

const SIDES = ['front', 'rear', 'left', 'right'] as const;

/** The parts of a vehicle worth editing: the ones the shader state and the models read. */
function editableParts(entry: ManifestVehicle | undefined): string[] {
  return Object.keys(entry?.parts ?? {}).filter((id) => id !== 'lightbar');
}

/** Pickers for the vehicle script, skin, paint, rust, lights, blood, and the state of its parts. */
export function VehicleEditor({ catalog, vehicle, onChange, names }: VehicleEditorProps) {
  const [filter, setFilter] = useState('');
  const vehicleNames = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return Object.keys(catalog.vehicles)
      .filter(
        (name) =>
          needle.length === 0 ||
          name.toLowerCase().includes(needle) ||
          displayName(names, 'vehicles', name).toLowerCase().includes(needle),
      )
      .sort()
      .slice(0, 80);
  }, [catalog, filter, names]);
  const entry = catalog.vehicles[vehicle.vehicle];
  const update = (patch: Partial<VehicleDescription>): void => onChange({ ...vehicle, ...patch });

  const setPart = (id: string, patch: Partial<VehiclePartState>): void => {
    const parts = { ...vehicle.parts };
    const state: VehiclePartState = { ...parts[id], ...patch };
    if (state.condition === 100) delete state.condition;
    if (state.missing === false) delete state.missing;
    if (state.open === false) delete state.open;
    if (Object.keys(state).length === 0) delete parts[id];
    else parts[id] = state;
    onChange(Object.keys(parts).length === 0 ? without(vehicle, 'parts') : { ...vehicle, parts });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 340, fontSize: 12 }}>
      <Field label={`Vehicle (${Object.keys(catalog.vehicles).length})`}>
        <input
          type="text"
          placeholder="filter, e.g. van"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          size={8}
          value={vehicle.vehicle}
          onChange={(e) => {
            if (e.target.value !== '') {
              onChange({
                format: vehicle.format,
                version: vehicle.version,
                vehicle: e.target.value,
              });
            }
          }}
        >
          {vehicleNames.map((name) => (
            <option key={name} value={name}>
              {names ? `${displayName(names, 'vehicles', name)} (${name})` : name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Skin (${entry?.skins.length ?? 0})`}>
        <select
          value={vehicle.skin ?? ''}
          onChange={(e) =>
            onChange(
              e.target.value === ''
                ? without(vehicle, 'skin')
                : { ...vehicle, skin: Number(e.target.value) },
            )
          }
        >
          <option value="">seeded</option>
          {(entry?.skins ?? []).map((skin, index) => (
            <option key={skin.texture} value={index}>
              {index}: {skin.texture.replace(/^vehicles\//, '')}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Paint">
        {vehicle.paint ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(['hue', 'saturation', 'value'] as const).map((channel) => (
              <label key={channel} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ width: 70 }}>{channel}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={vehicle.paint?.[channel] ?? 0}
                  onChange={(e) =>
                    update({
                      paint: {
                        hue: 0,
                        saturation: 0.5,
                        value: 0.5,
                        ...vehicle.paint,
                        [channel]: Number(e.target.value),
                      },
                    })
                  }
                />
                {(vehicle.paint?.[channel] ?? 0).toFixed(2)}
              </label>
            ))}
            <button type="button" onClick={() => onChange(without(vehicle, 'paint'))}>
              seeded
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => update({ paint: { hue: 0.6, saturation: 0.9, value: 0.7 } })}
          >
            choose a paint
          </button>
        )}
      </Field>
      <Field label={`Rust ${vehicle.rust === undefined ? '(seeded)' : vehicle.rust.toFixed(2)}`}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={vehicle.rust ?? 0}
            onChange={(e) => update({ rust: Number(e.target.value) })}
          />
          <button type="button" onClick={() => onChange(without(vehicle, 'rust'))}>
            seeded
          </button>
        </div>
      </Field>
      <Field label="Lights">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(['headlights', 'stoplights', 'interiorLight'] as const).map((flag) => (
            <label key={flag}>
              <input
                type="checkbox"
                checked={vehicle[flag] === true}
                onChange={(e) =>
                  onChange(e.target.checked ? { ...vehicle, [flag]: true } : without(vehicle, flag))
                }
              />{' '}
              {flag}
            </label>
          ))}
          {entry?.lightbar && (
            <select
              value={vehicle.lightbar ?? ''}
              onChange={(e) =>
                onChange(
                  e.target.value === ''
                    ? without(vehicle, 'lightbar')
                    : { ...vehicle, lightbar: e.target.value as 'left' | 'right' },
                )
              }
            >
              <option value="">light bar off</option>
              <option value="left">light bar left</option>
              <option value="right">light bar right</option>
            </select>
          )}
        </div>
      </Field>
      <Field label="Blood">
        {SIDES.map((side) => (
          <label key={side} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 70 }}>{side}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={vehicle.blood?.[side] ?? 0}
              onChange={(e) => {
                const blood = { ...vehicle.blood, [side]: Number(e.target.value) };
                if (blood[side] === 0) delete blood[side];
                onChange(
                  Object.keys(blood).length === 0
                    ? without(vehicle, 'blood')
                    : { ...vehicle, blood },
                );
              }}
            />
            {(vehicle.blood?.[side] ?? 0).toFixed(2)}
          </label>
        ))}
      </Field>
      <Field label="Seed">
        <input
          type="number"
          value={vehicle.seed ?? 0}
          onChange={(e) => update({ seed: Number(e.target.value) })}
        />
      </Field>
      <Field label={`Parts (${editableParts(entry).length})`}>
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>part</th>
                <th>condition</th>
                <th>missing</th>
                <th>open</th>
              </tr>
            </thead>
            <tbody>
              {editableParts(entry).map((id) => {
                const state = vehicle.parts?.[id];
                const part = entry?.parts[id];
                return (
                  <tr key={id}>
                    <td>{id}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        style={{ width: 50 }}
                        value={state?.condition ?? 100}
                        onChange={(e) =>
                          setPart(id, {
                            condition: Math.min(100, Math.max(0, Number(e.target.value))),
                          })
                        }
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={state?.missing === true}
                        onChange={(e) => setPart(id, { missing: e.target.checked })}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {(part?.window || part?.door) && (
                        <input
                          type="checkbox"
                          checked={state?.open === true}
                          onChange={(e) => setPart(id, { open: e.target.checked })}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Field>
    </div>
  );
}
