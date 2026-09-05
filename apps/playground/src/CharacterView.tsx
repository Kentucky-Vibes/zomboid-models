import { useState } from 'react';
import type { CameraOptions, LightingOption, SubjectDescription, ViewerMode } from 'zomboid-models';
import { ZomboidView } from 'zomboid-models-react';

export interface CharacterViewProps {
  assetBaseUrl: string;
  mode: ViewerMode;
  document: SubjectDescription;
  /** A clip name, null for the bind pose, or undefined to let the viewer pick the idle. */
  animation: string | null | undefined;
  animationSpeed?: number;
  camera?: CameraOptions;
  lighting?: LightingOption;
  width: number;
  height: number;
}

/** Mounts one viewer through the React package and lists the warnings and errors it reports. */
export function CharacterView({
  assetBaseUrl,
  mode,
  document,
  animation,
  animationSpeed,
  camera,
  lighting,
  width,
  height,
}: CharacterViewProps) {
  const [messages, setMessages] = useState<string[]>([]);

  return (
    <div>
      <ZomboidView
        assetBaseUrl={assetBaseUrl}
        mode={mode}
        document={document}
        {...(animation === undefined ? {} : { animation })}
        {...(animationSpeed === undefined ? {} : { animationSpeed })}
        {...(camera ? { camera } : {})}
        {...(lighting === undefined ? {} : { lighting })}
        background={mode === 'viewer' ? '#4a4c50' : 'transparent'}
        style={{ width, height, background: '#3a3c40' }}
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
