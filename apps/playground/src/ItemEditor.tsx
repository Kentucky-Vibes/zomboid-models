import { useMemo, useState } from 'react';
import { displayName, type ItemDescription } from 'zomboid-models';
import type { NamesCatalog } from 'zomboid-models';
import type { ItemCatalog } from 'zomboid-models/rules';

export interface ItemEditorProps {
  catalog: ItemCatalog;
  item: ItemDescription;
  onChange: (item: ItemDescription) => void;
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

/** Pickers for the item type and which of its models to show. */
export function ItemEditor({ catalog, item, onChange, names }: ItemEditorProps) {
  const [filter, setFilter] = useState('');
  const types = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return Object.keys(catalog.items)
      .filter(
        (type) =>
          needle.length === 0 ||
          type.toLowerCase().includes(needle) ||
          displayName(names, 'items', type).toLowerCase().includes(needle),
      )
      .sort()
      .slice(0, 80);
  }, [catalog, filter, names]);
  const entry = catalog.items[item.item];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 320, fontSize: 12 }}>
      <Field
        label={`Item (${Object.keys(catalog.items).length}; ${names ? displayName(names, 'items', item.item) : (entry?.displayName ?? 'unknown')})`}
      >
        <input
          type="text"
          placeholder="filter, e.g. axe"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          size={12}
          value={item.item}
          onChange={(e) => {
            if (e.target.value !== '') onChange({ ...item, item: e.target.value });
          }}
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {names ? `${displayName(names, 'items', type)} (${type})` : type}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Model">
        <select
          value={item.model ?? 'world'}
          onChange={(e) => {
            const rest = { ...item };
            delete rest.model;
            onChange(e.target.value === 'world' ? rest : { ...rest, model: 'held' });
          }}
        >
          <option value="world">on the ground{entry?.world ? '' : ' (missing)'}</option>
          <option value="held">in the hand{entry?.held ? '' : ' (missing)'}</option>
        </select>
      </Field>
    </div>
  );
}
