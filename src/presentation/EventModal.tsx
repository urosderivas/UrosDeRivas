import { useState, useEffect } from 'react';
import { CalendarDays, Plus, X, Trash2 } from 'lucide-react';
import { Event, CustomField } from '../domain/entities';
import { Modal } from './components/Modal';
import './MarketItemModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: Omit<Event, 'id'>) => Promise<void>;
  initial?: Event | null;
}

export function EventModal({ isOpen, onClose, onSave, initial }: Props) {
  const [title, setTitle] = useState('');
  const [dates, setDates] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [schedule, setSchedule] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [pricePerDay, setPricePerDay] = useState(0);
  const [priceTiers, setPriceTiers] = useState<{ minDays: number; pricePerDay: number }[]>([]);
  const [attendeeDiscounts, setAttendeeDiscounts] = useState<{ minAttendees: number; discountPct: number }[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [maxCapacity, setMaxCapacity] = useState<number | ''>('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newDateInput, setNewDateInput] = useState('');

  useEffect(() => {
    if (initial) {
      setTitle(initial.title);
      setDates(initial.dates || []);
      setLocation(initial.location);
      setSchedule(initial.schedule || '');
      setImageUrl(initial.imageUrl || '');
      setDescription(initial.description || '');
      setPricePerDay(initial.price_per_day || 0);
      setPriceTiers(initial.price_tiers || []);
      setAttendeeDiscounts(initial.attendee_discounts || []);
      setCustomFields(initial.custom_fields || []);
      setMaxCapacity(initial.max_capacity || '');
      setActive(initial.active !== false);
    } else {
      setTitle(''); setDates([]); setLocation(''); setSchedule('');
      setImageUrl(''); setDescription(''); setPricePerDay(0);
      setPriceTiers([]); setAttendeeDiscounts([]); setCustomFields([]);
      setMaxCapacity(''); setActive(true);
    }
    setError(''); setNewDateInput('');
  }, [initial, isOpen]);

  const handleAddDate = () => {
    if (newDateInput && !dates.includes(newDateInput)) {
      setDates([...dates, newDateInput].sort());
      setNewDateInput('');
    }
  };

  const handleRemoveDate = (d: string) => setDates(dates.filter(x => x !== d));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !location || dates.length === 0) {
      setError('Título, Ubicación y al menos una fecha son obligatorios.');
      return;
    }
    setSaving(true); setError('');
    try {
      await onSave({
        title, date: dates[0], dates, location, imageUrl, description,
        schedule, type: 'campus', price_per_day: pricePerDay,
        price_tiers: priceTiers, attendee_discounts: attendeeDiscounts,
        custom_fields: customFields, max_capacity: maxCapacity || undefined,
        active,
      });
      onClose();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  // Custom fields management
  const addCustomField = () => {
    setCustomFields([...customFields, { name: '', type: 'text', required: false }]);
  };
  const updateCustomField = (i: number, field: Partial<CustomField>) => {
    const updated = [...customFields];
    updated[i] = { ...updated[i], ...field };
    setCustomFields(updated);
  };
  const removeCustomField = (i: number) => setCustomFields(customFields.filter((_, idx) => idx !== i));

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={initial ? 'Editar Campus' : 'Nuevo Campus'}
      icon={<CalendarDays size={22} />} maxWidth="720px">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        
        {/* Title + Image Preview */}
        <div className="modal-preview-row">
          <div className="modal-image-preview">
            {imageUrl
              ? <img src={imageUrl} alt="preview" onError={e => { e.currentTarget.src = ''; }} />
              : <div className="preview-placeholder"><CalendarDays size={40} /></div>}
          </div>
          <div className="modal-main-fields">
            <div className="form-group">
              <label>Título *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Campus de Semana Santa 2026" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Ubicación *</label>
                <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Pabellón de los Almendros" />
              </div>
              <div className="form-group">
                <label>Horario</label>
                <input value={schedule} onChange={e => setSchedule(e.target.value)} placeholder="9:00 - 14:00" />
              </div>
            </div>
          </div>
        </div>

        {/* Image URL */}
        <div className="form-group">
          <label>URL de Imagen / Cartel</label>
          <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
        </div>

        {/* Dates picker */}
        <div className="form-group">
          <label>Fechas del Campus *</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input type="date" value={newDateInput} onChange={e => setNewDateInput(e.target.value)} style={{ flex: 1 }} />
            <button type="button" className="btn-modal-save" style={{ padding: '8px 16px' }} onClick={handleAddDate}>
              <Plus size={16} /> Añadir
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {dates.map(d => (
              <span key={d} style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.3)',
                padding: '4px 10px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600,
              }}>
                {new Date(d + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                <button type="button" onClick={() => handleRemoveDate(d)}
                  style={{ background: 'none', border: 'none', color: '#d4af37', cursor: 'pointer', padding: 0 }}>
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
          {dates.length === 0 && <p style={{ color: '#888', fontSize: '0.8rem', margin: '4px 0 0' }}>Añade al menos una fecha.</p>}
        </div>

        {/* Pricing */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '16px' }}>
          <label style={{ fontWeight: 700, marginBottom: '12px', display: 'block' }}>💰 Precios</label>
          <div className="form-row">
            <div className="form-group">
              <label>Precio base / día (€)</label>
              <input type="number" min="0" step="0.01" value={pricePerDay} onChange={e => setPricePerDay(Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>Aforo máximo</label>
              <input type="number" min="1" value={maxCapacity} onChange={e => setMaxCapacity(e.target.value ? Number(e.target.value) : '')} placeholder="Ilimitado" />
            </div>
          </div>

          {/* Tier pricing */}
          <label style={{ fontSize: '0.85rem', color: '#aaa', marginTop: '10px', display: 'block' }}>Descuentos por nº de días</label>
          {priceTiers.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
              <span style={{ fontSize: '0.85rem', color: '#999', whiteSpace: 'nowrap' }}>Desde</span>
              <input type="number" min="1" value={t.minDays} style={{ width: '60px' }}
                onChange={e => { const u = [...priceTiers]; u[i].minDays = Number(e.target.value); setPriceTiers(u); }} />
              <span style={{ fontSize: '0.85rem', color: '#999', whiteSpace: 'nowrap' }}>días →</span>
              <input type="number" min="0" step="0.01" value={t.pricePerDay} style={{ width: '80px' }}
                onChange={e => { const u = [...priceTiers]; u[i].pricePerDay = Number(e.target.value); setPriceTiers(u); }} />
              <span style={{ fontSize: '0.85rem', color: '#999' }}>€/día</span>
              <button type="button" onClick={() => setPriceTiers(priceTiers.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: '#e53935', cursor: 'pointer' }}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setPriceTiers([...priceTiers, { minDays: 3, pricePerDay: 0 }])}
            style={{ marginTop: '8px', background: 'none', border: '1px dashed rgba(255,255,255,0.2)', color: '#aaa', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
            + Añadir tier
          </button>

          {/* Attendee discounts */}
          <label style={{ fontSize: '0.85rem', color: '#aaa', marginTop: '14px', display: 'block' }}>Descuentos por nº de asistentes</label>
          {attendeeDiscounts.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
              <span style={{ fontSize: '0.85rem', color: '#999', whiteSpace: 'nowrap' }}>Desde</span>
              <input type="number" min="1" value={d.minAttendees} style={{ width: '60px' }}
                onChange={e => { const u = [...attendeeDiscounts]; u[i].minAttendees = Number(e.target.value); setAttendeeDiscounts(u); }} />
              <span style={{ fontSize: '0.85rem', color: '#999', whiteSpace: 'nowrap' }}>asist. →</span>
              <input type="number" min="0" max="100" value={d.discountPct} style={{ width: '60px' }}
                onChange={e => { const u = [...attendeeDiscounts]; u[i].discountPct = Number(e.target.value); setAttendeeDiscounts(u); }} />
              <span style={{ fontSize: '0.85rem', color: '#999' }}>% dto.</span>
              <button type="button" onClick={() => setAttendeeDiscounts(attendeeDiscounts.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: '#e53935', cursor: 'pointer' }}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setAttendeeDiscounts([...attendeeDiscounts, { minAttendees: 2, discountPct: 10 }])}
            style={{ marginTop: '8px', background: 'none', border: '1px dashed rgba(255,255,255,0.2)', color: '#aaa', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
            + Añadir descuento
          </button>
        </div>

        {/* Custom fields */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '16px' }}>
          <label style={{ fontWeight: 700, marginBottom: '12px', display: 'block' }}>📋 Campos Personalizados (Inscripción)</label>
          {customFields.map((cf, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <input value={cf.name} placeholder="Nombre del campo" style={{ flex: 1 }}
                onChange={e => updateCustomField(i, { name: e.target.value })} />
              <select value={cf.type} onChange={e => updateCustomField(i, { type: e.target.value as 'text' | 'categorical' })}
                style={{ width: '110px' }}>
                <option value="text">Texto</option>
                <option value="categorical">Opciones</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#aaa', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={cf.required} onChange={e => updateCustomField(i, { required: e.target.checked })} /> Req.
              </label>
              <button type="button" onClick={() => removeCustomField(i)}
                style={{ background: 'none', border: 'none', color: '#e53935', cursor: 'pointer' }}><Trash2 size={14} /></button>
            </div>
          ))}
          {customFields.filter(cf => cf.type === 'categorical').map((cf, _i) => {
            const idx = customFields.indexOf(cf);
            return (
              <div key={`opts-${idx}`} style={{ marginBottom: '8px', paddingLeft: '12px' }}>
                <input placeholder="Opciones separadas por coma" value={(cf.options || []).join(', ')}
                  onChange={e => updateCustomField(idx, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  style={{ width: '100%', fontSize: '0.85rem' }} />
              </div>
            );
          })}
          <button type="button" onClick={addCustomField}
            style={{ background: 'none', border: '1px dashed rgba(255,255,255,0.2)', color: '#aaa', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
            + Añadir campo
          </button>
        </div>

        {/* Description */}
        <div className="form-group">
          <label>Descripción</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            placeholder="Información adicional, niveles, materiales necesarios..." />
        </div>

        {/* Active toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
          Campus activo (visible para usuarios)
        </label>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onClose} className="btn-modal-cancel">Cancelar</button>
          <button type="submit" className="btn-modal-save" disabled={saving}>
            {saving ? 'Guardando...' : initial ? 'Guardar Cambios' : 'Crear Campus'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
