import {
  displayName,
  type SceneDescription,
  type SceneSubject,
  type SceneSubjectDescription,
} from 'zomboid-models';
import type { NamesCatalog } from 'zomboid-models';
import type { VehicleCatalog } from 'zomboid-models/rules';

export interface SceneEditorProps {
  scene: SceneDescription;
  onChange: (scene: SceneDescription) => void;
  /** The documents of the other editors, to add to the scene. */
  sources: Record<'character' | 'animal' | 'item' | 'vehicle', SceneSubjectDescription>;
  vehicles: VehicleCatalog | undefined;
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

/** A short label for a subject: its kind and the name of what it shows. */
function describe(subject: SceneSubject, names: NamesCatalog | undefined): string {
  const doc = subject.document;
  switch (doc.format) {
    case 'zomboid-models/vehicle':
      return `vehicle: ${displayName(names, 'vehicles', doc.vehicle)}`;
    case 'zomboid-models/animal':
      return `animal: ${displayName(names, 'animals', doc.type)}`;
    case 'zomboid-models/item':
      return `item: ${displayName(names, 'items', doc.item)}`;
    default:
      return `character: ${doc.outfit?.name ?? doc.body.sex}${doc.body.zombie ? ' (zombie)' : ''}`;
  }
}

/** Adds, removes, places, turns, and seats the subjects of a scene. */
export function SceneEditor({ scene, onChange, sources, vehicles, names }: SceneEditorProps) {
  const subjects = scene.subjects;
  const setSubjects = (next: SceneSubject[]): void => onChange({ ...scene, subjects: next });
  const updateSubject = (index: number, patch: Partial<SceneSubject>): void =>
    setSubjects(subjects.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const vehicleIndexes = subjects
    .map((s, i) => (s.document.format === 'zomboid-models/vehicle' ? i : -1))
    .filter((i) => i >= 0);
  const seatsOf = (index: number): string[] => {
    const doc = subjects[index]?.document;
    if (!doc || doc.format !== 'zomboid-models/vehicle') return [];
    return Object.keys(vehicles?.vehicles[doc.vehicle]?.seats ?? {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 360, fontSize: 12 }}>
      <Field label="Add the current">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['character', 'animal', 'item', 'vehicle'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() =>
                setSubjects([...subjects, { document: structuredClone(sources[kind]) }])
              }
            >
              {kind}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Ground">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="color"
            value={scene.ground ?? '#333438'}
            onChange={(e) => onChange({ ...scene, ground: e.target.value })}
          />
          <button type="button" onClick={() => onChange(without(scene, 'ground'))}>
            none
          </button>
        </div>
      </Field>
      <Field label={`Subjects (${subjects.length})`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {subjects.map((subject, index) => {
            const seated = subject.seat !== undefined;
            const isCharacter = subject.document.format === 'zomboid-models/character';
            return (
              <div
                key={index}
                style={{
                  border: '1px solid #444',
                  padding: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>
                    {index}: {describe(subject, names)}
                  </span>
                  <button
                    type="button"
                    title="remove"
                    onClick={() =>
                      setSubjects(
                        subjects
                          .filter((_, i) => i !== index)
                          .map((s) =>
                            s.in === undefined
                              ? s
                              : s.in === index
                                ? without(without(s, 'in'), 'seat')
                                : { ...s, in: s.in > index ? s.in - 1 : s.in },
                          ),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
                {!seated && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    x
                    <input
                      type="number"
                      step={0.5}
                      style={{ width: 60 }}
                      value={subject.position?.[0] ?? ''}
                      placeholder="auto"
                      onChange={(e) =>
                        updateSubject(index, {
                          position: [Number(e.target.value), subject.position?.[1] ?? 0],
                        })
                      }
                    />
                    z
                    <input
                      type="number"
                      step={0.5}
                      style={{ width: 60 }}
                      value={subject.position?.[1] ?? ''}
                      placeholder="auto"
                      onChange={(e) =>
                        updateSubject(index, {
                          position: [subject.position?.[0] ?? 0, Number(e.target.value)],
                        })
                      }
                    />
                    yaw
                    <input
                      type="number"
                      step={15}
                      style={{ width: 60 }}
                      value={subject.yaw ?? 0}
                      onChange={(e) => updateSubject(index, { yaw: Number(e.target.value) })}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSubjects(
                          subjects.map((s, i) =>
                            i === index ? without(without(s, 'position'), 'yaw') : s,
                          ),
                        )
                      }
                    >
                      auto
                    </button>
                  </div>
                )}
                {isCharacter && vehicleIndexes.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    seat
                    <select
                      value={seated ? `${subject.in ?? ''}:${subject.seat ?? ''}` : ''}
                      onChange={(e) => {
                        if (e.target.value === '') {
                          setSubjects(
                            subjects.map((s, i) =>
                              i === index ? without(without(s, 'in'), 'seat') : s,
                            ),
                          );
                          return;
                        }
                        const colon = e.target.value.indexOf(':');
                        updateSubject(index, {
                          in: Number(e.target.value.slice(0, colon)),
                          seat: e.target.value.slice(colon + 1),
                        });
                      }}
                    >
                      <option value="">standing</option>
                      {vehicleIndexes.flatMap((vehicleIndex) =>
                        seatsOf(vehicleIndex).map((seat) => (
                          <option key={`${vehicleIndex}:${seat}`} value={`${vehicleIndex}:${seat}`}>
                            {vehicleIndex}: {seat}
                          </option>
                        )),
                      )}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Field>
    </div>
  );
}
