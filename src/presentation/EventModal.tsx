import { useState, useEffect } from 'react';
import { CalendarDays } from 'lucide-react';
import { Event } from '../domain/entities';
import { Modal } from './components/Modal';
import './MarketItemModal.css'; // Shared internal form styles

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: Omit<Event, 'id'>) => Promise<void>;
  initial?: Event | null;
}

const EVENT_TYPES: { value: Event['type']; label: string; icon: string }[] = [
  { value: 'match', label: 'Partido', icon: '🏀' },
  { value: 'training', label: 'Entrenamiento', icon: '⚡' },
  { value: 'campus', label: 'Campus / Evento', icon: '🏕️' },
];

export function EventModal({ isOpen, onClose, onSave, initial }: Props) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Event['type']>('campus');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initial) {
      setTitle(initial.title);
      setType(initial.type);
      setDate(initial.date);
      setLocation(initial.location);
      setImageUrl(initial.imageUrl || '');
      setDescription(initial.description || '');
    } else {
      setTitle(''); setType('campus');
      setDate(new Date().toISOString().split('T')[0]);
      setLocation(''); setImageUrl(''); setDescription('');
    }
    setError('');
  }, [initial, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date || !location) { setError('Título, Fecha y Lugar son obligatorios.'); return; }
    setSaving(true); setError('');
    try {
      await onSave({ title, type, date, location, imageUrl, description });
      onClose();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initial ? 'Editar Evento' : 'Nuevo Evento'}
      icon={<CalendarDays size={22} />}
      maxWidth="680px"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Type Selector */}
        <div className="form-group">
          <label>Tipo de Evento</label>
          <div className="event-type-selector">
            {EVENT_TYPES.map(et => (
              <button key={et.value} type="button"
                className={`event-type-chip ${type === et.value ? 'active' : ''}`}
                onClick={() => setType(et.value)}>
                <span>{et.icon}</span> {et.label}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-preview-row">
          <div className="modal-image-preview">
            {imageUrl
              ? <img src={imageUrl} alt="preview" onError={e => { e.currentTarget.src = ''; }} />
              : <div className="preview-placeholder"><CalendarDays size={40} /></div>
            }
          </div>
          <div className="modal-main-fields">
            <div className="form-group">
              <label>Título *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Campus de Junio 2025" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Fecha *</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Lugar *</label>
                <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Pabellón de Los Almendros" />
              </div>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>URL de Imagen / Cartel</label>
          <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
        </div>

        <div className="form-group">
          <label>Información / Descripción</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
            placeholder="Fechas, horarios, precios de inscripción, número de cuenta bancaria, contacto..." />
        </div>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onClose} className="btn-modal-cancel">Cancelar</button>
          <button type="submit" className="btn-modal-save" disabled={saving}>
            {saving ? 'Guardando...' : initial ? 'Guardar Cambios' : 'Crear Evento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
