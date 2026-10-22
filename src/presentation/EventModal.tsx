import { useState, useEffect } from 'react';
import { CalendarDays, Plus, X, Trash2 } from 'lucide-react';
import { Event, CustomField, EventType } from '../domain/entities';
import { MAX_PRICE_OPTIONS, MAX_TABLE_DAYS, eventOptions, eventTable, legacyPrice, parsePriceOptions, roundCents } from '../domain/pricing';
import { Modal } from './components/Modal';
import { PriceTableEditor, PriceTableDraft, draftToTable } from './components/PriceTableEditor';
import { ImageField } from './components/ImageField';
import { resolveImageUrl } from '../utils/media';
import './MarketItemModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: Omit<Event, 'id'>) => Promise<void>;
  initial?: Event | null;
  /** Tipo con el que se crea un evento nuevo (la pestaña desde la que se abre) */
  defaultType?: EventType;
  /** Los demás eventos, para copiar su tabla de precios */
  otherEvents?: Event[];
}

const MAX_RANGE_DAYS = 60;
const EVENT_TYPE_LABELS: Record<EventType, string> = { campus: 'Campus', torneo: 'Torneo o viaje' };

/** Tabla inicial: la del evento, o la equivalente al sistema anterior de descuentos. */
function initialDraft(ev: Event | null | undefined, defaultType: EventType): { draft: PriceTableDraft; converted: boolean } {
  if (!ev) return { draft: { byDays: defaultType === 'campus', rows: [[]], extra: '' }, converted: false };
  const table = eventTable(ev);
  if (table) return { draft: { byDays: table.byDays, rows: table.prices, extra: table.extraAttendee }, converted: false };
  if (ev.price_table) {
    // Tabla guardada que ya no cuadra (p. ej. con otras fechas): se recupera lo que hay
    const t = ev.price_table as any;
    return { draft: { byDays: t.byDays !== false, rows: Array.isArray(t.prices) ? t.prices : [[]], extra: t.extraAttendee ?? '' }, converted: false };
  }
  const numDays = (ev.dates || []).length;
  const maxDiscountRow = Math.max(1, ...(ev.attendee_discounts || []).map(d => d.minAttendees));
  const numRows = Math.min(4, Math.max(2, maxDiscountRow));
  const rows = Array.from({ length: numRows }, (_, a) => Array.from({ length: numDays }, (_, d) => legacyPrice(ev, a + 1, d + 1)));
  const extra = roundCents(legacyPrice(ev, numRows + 1, 1) - legacyPrice(ev, numRows, 1));
  return {
    draft: { byDays: true, rows, extra: Number.isFinite(extra) ? Math.max(0, extra) : '' },
    converted: numDays > 0,
  };
}

/** Opción de precio de un torneo o viaje mientras se edita */
type OptionDraft = { label: string; price: number | '' };

export function EventModal({ isOpen, onClose, onSave, initial, defaultType = 'campus', otherEvents = [] }: Props) {
  const [type, setType] = useState<EventType>(defaultType);
  const [title, setTitle] = useState('');
  const [dates, setDates] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [schedule, setSchedule] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [priceDraft, setPriceDraft] = useState<PriceTableDraft>({ byDays: true, rows: [[]], extra: '' });
  const [pricesConverted, setPricesConverted] = useState(false);
  const [priceOptions, setPriceOptions] = useState<OptionDraft[]>([{ label: '', price: '' }]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [maxCapacity, setMaxCapacity] = useState<number | ''>('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newDateInput, setNewDateInput] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  useEffect(() => {
    const { draft, converted } = initialDraft(initial, defaultType);
    setPriceDraft(draft);
    setPricesConverted(converted);
    setPriceOptions(initial ? eventOptions({ ...initial, type: 'torneo' }) ?? [{ label: '', price: '' }] : [{ label: '', price: '' }]);
    if (initial) {
      setType(initial.type || 'campus');
      setTitle(initial.title);
      setDates(initial.dates || []);
      setLocation(initial.location);
      setSchedule(initial.schedule || '');
      setImageUrl(initial.imageUrl || '');
      setDescription(initial.description || '');
      setCustomFields(initial.custom_fields || []);
      setMaxCapacity(initial.max_capacity || '');
      setActive(initial.active !== false);
    } else {
      setTitle(''); setDates([]); setLocation(''); setSchedule('');
      setImageUrl(''); setDescription(''); setType(defaultType);
      setCustomFields([]); setMaxCapacity(''); setActive(true);
    }
    setError(''); setNewDateInput(''); setRangeFrom(''); setRangeTo('');
  }, [initial, isOpen, defaultType]);

  const handleAddDate = () => {
    if (newDateInput && !dates.includes(newDateInput)) {
      setDates([...dates, newDateInput].sort());
      setNewDateInput('');
    }
  };

  // Todos los días entre dos fechas, sin tener que añadirlos uno a uno
  const handleAddRange = () => {
    if (!rangeFrom || !rangeTo) return;
    const [from, to] = rangeFrom <= rangeTo ? [rangeFrom, rangeTo] : [rangeTo, rangeFrom];
    const added: string[] = [];
    const day = new Date(`${from}T12:00:00Z`);
    while (added.length < MAX_RANGE_DAYS) {
      const iso = day.toISOString().slice(0, 10);
      if (iso > to) break;
      added.push(iso);
      day.setUTCDate(day.getUTCDate() + 1);
    }
    setDates(Array.from(new Set([...dates, ...added])).sort());
    setRangeFrom(''); setRangeTo('');
  };

  const handleRemoveDate = (d: string) => setDates(dates.filter(x => x !== d));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !location || dates.length === 0) {
      setError('Título, Ubicación y al menos una fecha son obligatorios.');
      return;
    }
    if (dates.length > MAX_TABLE_DAYS) {
      setError(`Un evento puede tener como mucho ${MAX_TABLE_DAYS} fechas.`);
      return;
    }
    // Torneos y viajes: precio por jugador (fijo o por opciones); campus: tabla de precios
    const isTorneo = type === 'torneo';
    const options = isTorneo ? parsePriceOptions(priceOptions.map(o => ({ label: o.label.trim(), price: o.price }))) : null;
    const priceTable = isTorneo ? null : draftToTable(priceDraft, dates.length);
    if (isTorneo && !options) {
      setError(priceOptions.length > 1
        ? 'Cada opción necesita un nombre y un precio (pon 0 si es gratis).'
        : 'Pon el precio por jugador (0 si es gratis).');
      return;
    }
    if (!isTorneo && !priceTable) {
      setError('Rellena todas las casillas de la tabla de precios (pon 0 si es gratis).');
      return;
    }
    setSaving(true); setError('');
    try {
      await onSave({
        title, date: dates[0], dates, location, imageUrl, description,
        schedule, type, price_table: priceTable, price_options: options,
        // Los campos del sistema anterior quedan sin uso; price_per_day = precio más bajo, para listados
        price_per_day: options ? Math.min(...options.map(o => o.price)) : priceTable!.prices[0][0],
        price_tiers: [], attendee_discounts: [],
        custom_fields: customFields, max_capacity: maxCapacity === '' ? null : maxCapacity,
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
      title={initial ? `Editar ${EVENT_TYPE_LABELS[type].toLowerCase()}` : `Nuevo ${EVENT_TYPE_LABELS[type].toLowerCase()}`}
      icon={<CalendarDays size={22} />} maxWidth="720px">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        
        {/* Title + Image Preview */}
        <div className="modal-preview-row">
          <div className="modal-image-preview">
            {imageUrl
              ? <img src={resolveImageUrl(imageUrl)} alt="preview" onError={e => { e.currentTarget.src = ''; }} />
              : <div className="preview-placeholder"><CalendarDays size={40} /></div>}
          </div>
          <div className="modal-main-fields">
            <div className="form-group">
              <label>Título *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder={type === 'torneo' ? 'Torneo de Navidad en Valencia' : 'Campus de Semana Santa 2026'} />
            </div>
            <div className="form-group">
              <label>Pestaña</label>
              <select value={type} onChange={e => setType(e.target.value as EventType)}>
                <option value="campus">Campus</option>
                <option value="torneo">Torneos y viajes</option>
              </select>
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

        {/* Imagen / cartel: subir archivo o pegar URL */}
        <ImageField label="Imagen / Cartel" value={imageUrl} onChange={setImageUrl} folder="events" preview={false} />

        {/* Dates picker */}
        <div className="form-group">
          <label>Fechas *</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Del</span>
            <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} style={{ flex: 1, minWidth: '140px' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>al</span>
            <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} style={{ flex: 1, minWidth: '140px' }} />
            <button type="button" className="btn-modal-save" style={{ padding: '8px 16px' }} onClick={handleAddRange} disabled={!rangeFrom || !rangeTo}>
              <Plus size={16} /> Añadir días
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>O un día suelto</span>
            <input type="date" value={newDateInput} onChange={e => setNewDateInput(e.target.value)} style={{ flex: 1, minWidth: '140px' }} />
            <button type="button" className="btn-modal-save" style={{ padding: '8px 16px' }} onClick={handleAddDate} disabled={!newDateInput}>
              <Plus size={16} /> Añadir
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {dates.map(d => (
              <span key={d} style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                background: 'rgba(var(--accent-rgb), 0.15)', color: 'var(--accent-text)', border: '1px solid rgba(var(--accent-rgb), 0.3)',
                padding: '4px 10px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600,
              }}>
                {new Date(d + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                <button type="button" onClick={() => handleRemoveDate(d)}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-text)', cursor: 'pointer', padding: 0 }}>
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
          {dates.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: '0.8rem', margin: '4px 0 0' }}>Añade al menos una fecha.</p>}
        </div>

        {/* Pricing */}
        <div style={{ background: 'rgba(var(--tint), 0.03)', border: '1px solid rgba(var(--tint), 0.08)', borderRadius: '10px', padding: '16px' }}>
          <label style={{ fontWeight: 700, marginBottom: '12px', display: 'block' }}>💰 Precios</label>
          {type === 'torneo' ? (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 12px' }}>
                Precio por jugador para todo el evento (cada jugador se inscribe por separado, sin descuentos).
                Si hay varios precios (p. ej. según use el autobús), añade una opción por cada uno y la familia elige.
              </p>
              {priceOptions.map((o, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <input value={o.label} maxLength={80} style={{ flex: 1 }}
                    placeholder={priceOptions.length > 1 ? 'Ej.: Ida y vuelta en bus' : 'Nombre (opcional si solo hay un precio)'}
                    onChange={e => setPriceOptions(priceOptions.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                  <input type="number" min="0" step="0.01" value={o.price} placeholder="€" style={{ width: '110px' }}
                    onChange={e => setPriceOptions(priceOptions.map((x, j) => j === i ? { ...x, price: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) } : x))} />
                  {priceOptions.length > 1 && (
                    <button type="button" onClick={() => setPriceOptions(priceOptions.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: '#e53935', cursor: 'pointer' }}><Trash2 size={14} /></button>
                  )}
                </div>
              ))}
              {priceOptions.length < MAX_PRICE_OPTIONS && (
                <button type="button" onClick={() => setPriceOptions([...priceOptions, { label: '', price: '' }])}
                  style={{ background: 'none', border: '1px dashed rgba(var(--tint), 0.2)', color: 'var(--text-secondary)', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                  + Añadir otra opción de precio
                </button>
              )}
              <p style={{ color: 'var(--text-faint)', fontSize: '0.8rem', margin: '10px 0 0' }}>
                Para becas o precios especiales, crea cupones desde la tarjeta del evento (botón 🎟️) una vez guardado.
              </p>
            </div>
          ) : (
            <>
              {pricesConverted && (
                <p style={{ color: 'var(--warning-text)', fontSize: '0.85rem', margin: '0 0 12px' }}>
                  Precios pasados a tabla desde los descuentos que tenía. Revísalos y guarda.
                </p>
              )}
              <PriceTableEditor draft={priceDraft} onChange={draft => { setPriceDraft(draft); setPricesConverted(false); }}
                numDates={dates.length}
                copySources={otherEvents.flatMap(ev => {
                  const table = ev.type === 'torneo' ? null : eventTable(ev);
                  return table ? [{ id: ev.id, title: ev.title, table }] : [];
                })} />
            </>
          )}
          <div className="form-group" style={{ marginTop: '16px', maxWidth: '260px' }}>
            <label>Aforo máximo (asistentes)</label>
            <input type="number" min="1" value={maxCapacity} onChange={e => setMaxCapacity(e.target.value ? Number(e.target.value) : '')} placeholder="Ilimitado" />
          </div>
        </div>

        {/* Custom fields */}
        <div style={{ background: 'rgba(var(--tint), 0.03)', border: '1px solid rgba(var(--tint), 0.08)', borderRadius: '10px', padding: '16px' }}>
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
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
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
            style={{ background: 'none', border: '1px dashed rgba(var(--tint), 0.2)', color: 'var(--text-secondary)', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
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
          Visible para los usuarios
        </label>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onClose} className="btn-modal-cancel">Cancelar</button>
          <button type="submit" className="btn-modal-save" disabled={saving}>
            {saving ? 'Guardando...' : initial ? 'Guardar Cambios' : 'Crear'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
