import { useEffect, useRef, useState } from 'react';
import {
  ATTRIBUTION_TEXT,
  createViewer,
  type CharacterDescription,
  type RigWarning,
  type ViewerMode,
} from 'zomboid-models';

const ASSET_BASE_URL = `${import.meta.env.BASE_URL}dev-assets/`;

const DEMO_CHARACTER: CharacterDescription = {
  format: 'zomboid-models/character',
  version: 1,
  body: { sex: 'male', skin: 0 },
  worn: [{ item: 'Base.Trousers_Denim', textureChoice: 0 }],
};

function CharacterView({ mode, animation }: { mode: ViewerMode; animation: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    if (!host.current) return;
    setMessages([]);
    const viewer = createViewer(host.current, {
      assetBaseUrl: ASSET_BASE_URL,
      mode,
      character: DEMO_CHARACTER,
      animation,
      background: mode === 'viewer' ? '#1d1d1f' : 'transparent',
      autoRotate: false,
      onWarning: (warning: RigWarning) =>
        setMessages((m) => [...m, `${warning.code}: ${warning.message}`]),
      onError: (error) => setMessages((m) => [...m, `error: ${error.message}`]),
    });
    return () => viewer.dispose();
  }, [mode, animation]);

  return (
    <div>
      <div ref={host} style={{ width: 420, height: 560, background: '#333' }} />
      <ul style={{ fontFamily: 'monospace', fontSize: 12 }}>
        {messages.map((message, i) => (
          <li key={i}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

export function App() {
  const [animation, setAnimation] = useState<string | null>('Bob_Idle');
  return (
    <main style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <h1>zomboid-models playground</h1>
      <label>
        Animation:{' '}
        <select
          value={animation ?? ''}
          onChange={(e) => setAnimation(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">bind pose</option>
          <option value="Bob_Idle">Bob_Idle</option>
        </select>
      </label>
      <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
        <CharacterView mode="viewer" animation={animation} />
        <CharacterView mode="showcase" animation={animation} />
      </div>
      <footer>
        <small>{ATTRIBUTION_TEXT}</small>
      </footer>
    </main>
  );
}
