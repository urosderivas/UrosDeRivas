import { useState } from 'react';
import { SupabaseAdapter } from '../../infrastructure/SupabaseAdapter';
import { resolveImageUrl } from '../../utils/media';

const adapter = new SupabaseAdapter();

interface Props {
  label: string;
  value: string;
  onChange: (url: string) => void;
  folder: 'sponsors' | 'news';
  required?: boolean;
}

/** Campo de imagen: se puede subir un archivo o pegar una URL. */
export function ImageField({ label, value, onChange, folder, required }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('La imagen no puede pasar de 5 MB.'); return; }
    setUploading(true);
    setError('');
    try {
      onChange(await adapter.uploadImage(file, folder));
    } catch (e: any) {
      setError(e.message || 'No se pudo subir la imagen.');
    }
    setUploading(false);
  };

  return (
    <div className="form-group">
      <label>{label}{!required && <span className="label-hint"> (opcional)</span>}</label>
      {value && <img src={resolveImageUrl(value)} alt="" className="content-image-preview" />}
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading}
        onChange={e => handleFile(e.target.files?.[0])} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder="o pega aquí la URL de la imagen" />
      {uploading && <span className="label-hint">Subiendo imagen…</span>}
      {error && <p className="modal-error">{error}</p>}
    </div>
  );
}
