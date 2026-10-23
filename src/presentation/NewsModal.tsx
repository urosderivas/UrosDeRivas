import { useEffect, useState } from 'react';
import { Newspaper } from 'lucide-react';
import { Modal } from './components/Modal';
import { ImageField } from './components/ImageField';
import { Event, NewsPost } from '../domain/entities';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (post: Omit<NewsPost, 'id'>) => Promise<void>;
  initial?: NewsPost | null;
  events: Event[];
}

const toDateInput = (iso: string) => iso.slice(0, 10);

export function NewsModal({ isOpen, onClose, onSave, initial, events }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [eventId, setEventId] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTitle(initial?.title || '');
    setBody(initial?.body || '');
    setImageUrl(initial?.imageUrl || '');
    setEventId(initial?.eventId || '');
    setDate(toDateInput(initial?.publishedAt || new Date().toISOString()));
    setError('');
  }, [initial, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('El título es obligatorio.'); return; }
    setSaving(true);
    try {
      // Si no se cambia la fecha se conserva la hora original para no alterar el orden
      const publishedAt = initial && toDateInput(initial.publishedAt) === date
        ? initial.publishedAt
        : new Date(`${date}T12:00:00`).toISOString();
      await onSave({
        title: title.trim(), body: body.trim(), imageUrl: imageUrl.trim() || undefined,
        eventId: eventId || undefined, publishedAt,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar.');
    }
    setSaving(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initial ? 'Editar noticia' : 'Nueva noticia'} icon={<Newspaper size={22} />}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="form-group">
          <label>Título</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Abiertas las inscripciones del campus de verano" />
        </div>
        <div className="form-group">
          <label>Texto</label>
          <textarea rows={7} value={body} onChange={e => setBody(e.target.value)}
            placeholder={'Escribe la noticia. Deja una línea en blanco entre párrafos.\nPara un enlace: [texto del enlace](https://...)'} />
          <span className="label-hint">Enlaces: escribe [texto](https://web.com). Las direcciones sueltas también se convierten en enlace.</span>
        </div>
        <ImageField label="Imagen" value={imageUrl} onChange={setImageUrl} folder="news" />
        <div className="form-row">
          <div className="form-group">
            <label>Campus, torneo o viaje <span className="label-hint">(opcional)</span></label>
            <select value={eventId} onChange={e => setEventId(e.target.value)}>
              <option value="">Ninguno</option>
              {(['campus', 'torneo'] as const).map(kind => {
                const group = events.filter(ev => ev.type === kind);
                return group.length > 0 && (
                  <optgroup key={kind} label={kind === 'campus' ? 'Campus' : 'Torneos y viajes'}>
                    {group.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </div>
          <div className="form-group">
            <label>Fecha</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
        </div>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose} className="btn-modal-cancel">Cancelar</button>
          <button type="submit" className="btn-modal-save" disabled={saving}>{saving ? 'Guardando…' : 'Publicar'}</button>
        </div>
      </form>
    </Modal>
  );
}
