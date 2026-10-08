import { useRef, useState } from 'react';
import { useLang } from '../i18n.tsx';

interface Props {
  onFiles: (files: File[]) => void;
  onSample: () => void;
  sampleLabel: string;
  busy: boolean;
}

export function DropZone({ onFiles, onSample, sampleLabel, busy }: Props) {
  const { s } = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const handle = (list: FileList | null) => {
    if (list && list.length > 0) onFiles(Array.from(list));
  };

  return (
    <div
      className={`dropzone${over ? ' is-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
    >
      <svg className="dropzone-icon" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 6 8 14v20l16 8 16-8V14L24 6Zm0 4.4 11.4 5.7L24 21.8l-11.4-5.7L24 10.4ZM11 18.6l11 5.5V37.6l-11-5.5V18.6Zm26 0v13.5l-11 5.5V24.1l11-5.5Z" fill="currentColor" />
      </svg>
      <h2>{s.dropTitle}</h2>
      <p>{s.dropHint}</p>
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}>
          {s.dropButton}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onSample}>
          {sampleLabel}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept=".glb,.gltf,.obj,.mtl,.fbx,.dae,.bin,.png,.jpg,.jpeg,.webp,.tga"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
