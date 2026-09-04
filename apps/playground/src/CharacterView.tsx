import { useEffect, useRef, useState } from 'react';
import {
  createViewer,
  type CameraOptions,
  type CharacterDescription,
  type ViewerMode,
} from 'zomboid-models';

export interface CharacterViewProps {
  assetBaseUrl: string;
  mode: ViewerMode;
  character: CharacterDescription;
  animation: string | null;
  camera?: CameraOptions;
  width: number;
  height: number;
}

/** Mounts one viewer and lists the warnings and errors it reports. */
export function CharacterView({
  assetBaseUrl,
  mode,
  character,
  animation,
  camera,
  width,
  height,
}: CharacterViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    if (!host.current) return;
    setMessages([]);
    const viewer = createViewer(host.current, {
      assetBaseUrl,
      mode,
      character,
      animation,
      ...(camera ? { camera } : {}),
      background: mode === 'viewer' ? '#1d1d1f' : 'transparent',
      onWarning: (warning) => setMessages((m) => [...m, `${warning.code}: ${warning.message}`]),
      onError: (error) => setMessages((m) => [...m, `error: ${error.message}`]),
    });
    return () => viewer.dispose();
  }, [assetBaseUrl, mode, character, animation, camera]);

  return (
    <div>
      <div ref={host} style={{ width, height, background: '#2a2a2e' }} />
      {messages.length > 0 && (
        <ul
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            margin: '4px 0',
            paddingLeft: 16,
            maxWidth: width,
          }}
        >
          {messages.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
