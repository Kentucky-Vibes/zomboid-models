import { useState } from 'react';
import type { CameraOptions, CharacterDescription, ViewerMode } from 'zomboid-models';
import { ZomboidCharacter } from 'zomboid-models-react';

export interface CharacterViewProps {
  assetBaseUrl: string;
  mode: ViewerMode;
  character: CharacterDescription;
  /** A clip name, null for the bind pose, or undefined to let the viewer pick the idle. */
  animation: string | null | undefined;
  camera?: CameraOptions;
  width: number;
  height: number;
}

/** Mounts one viewer through the React package and lists the warnings and errors it reports. */
export function CharacterView({
  assetBaseUrl,
  mode,
  character,
  animation,
  camera,
  width,
  height,
}: CharacterViewProps) {
  const [messages, setMessages] = useState<string[]>([]);

  return (
    <div>
      <ZomboidCharacter
        assetBaseUrl={assetBaseUrl}
        mode={mode}
        character={character}
        {...(animation === undefined ? {} : { animation })}
        {...(camera ? { camera } : {})}
        background={mode === 'viewer' ? '#1d1d1f' : 'transparent'}
        style={{ width, height, background: '#2a2a2e' }}
        onWarning={(warning) => setMessages((m) => [...m, `${warning.code}: ${warning.message}`])}
        onError={(error) => setMessages((m) => [...m, `error: ${error.message}`])}
      />
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
