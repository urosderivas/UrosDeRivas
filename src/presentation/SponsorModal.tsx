import { useEffect, useState } from 'react';
import { Handshake } from 'lucide-react';
import { Modal } from './components/Modal';
import { ImageField } from './components/ImageField';
import { Sponsor } from '../domain/entities';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sponsor: Omit<Sponsor, 'id'>) => Promise<void>;
  initial?: Sponsor | null;
  nextSortOrder: number;
}

export function SponsorModal({ isOpen, onClose, onSave, initial, nextSortOrder }: Props) {
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(initial?.name || '');
    setImageUrl(initial?.imageUrl || '');
    setLinkUrl(initial?.linkUrl || '');
    setSortOrder(String(initial?.sortOrder ?? nextSortOrder));
    setActive(initial?.active ?? true);
    setError('');
  }, [initial, isOpen, nextSortOrder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !imageUrl.trim()) { setError('El nombre y la imagen son obligatorios.'); return; }
    if (linkUrl.trim() && !/^https?:\/\//.test(linkUrl.trim())) { setError('El enlace debe empezar por https://'); return; }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(), imageUrl: imageUrl.trim(), linkUrl: linkUrl.trim() || undefined,
        sortOrder: Number(sortOrder) || 0, active,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar.');
    }
    setSaving(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initial ? 'Editar patrocinador' : 'Nuevo patrocinador'} icon={<Handshake size={22} />} maxWidth="560px">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="form-group">
          <label>Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Clínica Dental Everest" />
        </div>
        <ImageField label="Logo" value={imageUrl} onChange={setImageUrl} folder="sponsors" required />
        <div className="form-group">
          <label>Web <span className="label-hint">(opcional)</span></label>
          <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Posición</label>
            <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Visible</label>
            <select value={active ? 'yes' : 'no'} onChange={e => setActive(e.target.value === 'yes')}>
              <option value="yes">Sí</option>
              <option value="no">No (oculto)</option>
            </select>
          </div>
        </div>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose} className="btn-modal-cancel">Cancelar</button>
          <button type="submit" className="btn-modal-save" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
