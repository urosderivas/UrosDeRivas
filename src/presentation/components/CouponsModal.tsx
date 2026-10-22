import { useEffect, useState } from 'react';
import { Ticket, Copy, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { Event, EventCoupon } from '../../domain/entities';
import { SupabaseAdapter } from '../../infrastructure/SupabaseAdapter';
import '../MarketItemModal.css';
import './CouponsModal.css';

const adapter = new SupabaseAdapter();
const MAX_BATCH = 50;

const euros = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(2)} €`;

type CouponState = { label: string; color: string; free: boolean };

/**
 * Estado de un cupón según la inscripción del pago al que apunta: usado si se pagó
 * (o era gratis), en curso mientras el pago siga pendiente, libre en otro caso.
 */
function couponState(coupon: EventCoupon, registrations: any[]): CouponState {
  const reg = coupon.stripe_session_id ? registrations.find(r => r.stripe_session_id === coupon.stripe_session_id) : null;
  const who = reg ? (reg.attendee_names || []).join(', ') || reg.user_email : '';
  if (reg?.status === 'completed') return { label: `Usado · ${who}`, color: '#10b981', free: false };
  if (reg?.status === 'pending') return { label: `Pago en curso · ${who}`, color: '#f59e0b', free: false };
  return { label: 'Libre', color: '#aaa', free: true };
}

/** Cupones de un torneo o viaje: cada código vale una vez y fija el precio final. Solo admins. */
export function CouponsModal({ event, onClose }: { event: Event; onClose: () => void }) {
  const [coupons, setCoupons] = useState<EventCoupon[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState<number | ''>(1);
  const [price, setPrice] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [list, regs] = await Promise.all([adapter.getCoupons(event.id), adapter.getCampusRegistrations(event.id)]);
      setCoupons(list);
      setRegistrations(regs);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [event.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (count === '' || count < 1 || count > MAX_BATCH) { setError(`Puedes crear entre 1 y ${MAX_BATCH} cupones a la vez.`); return; }
    if (price === '' || price < 0) { setError('Pon el precio final que pagará quien use el cupón.'); return; }
    if (price > 0 && price < 0.5) { setError('El precio tiene que ser 0 (gratis) o al menos 0,50 €.'); return; }
    setSaving(true); setError('');
    try {
      const created = await adapter.createCoupons(event.id, count, Math.round(price * 100) / 100, note);
      setCoupons(prev => [...created, ...prev]);
      setNote('');
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (coupon: EventCoupon) => {
    try {
      await adapter.deleteCoupon(coupon.id);
      setCoupons(prev => prev.filter(c => c.id !== coupon.id));
    } catch (e: any) { setError(e.message); }
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch { /* sin portapapeles: el código se puede seleccionar a mano */ }
  };

  const freeCoupons = coupons.filter(c => couponState(c, registrations).free);

  return (
    <Modal isOpen onClose={onClose} title={`Cupones · ${event.title}`} icon={<Ticket size={22} />} maxWidth="720px">
      <p style={{ color: '#aaa', fontSize: '0.9rem', marginTop: 0 }}>
        Cada código vale <b>una sola vez</b> y solo para este evento. Quien lo use paga el precio del cupón en vez del normal
        (0 € = gratis). Si el pago se cancela o caduca, el cupón vuelve a quedar libre.
      </p>

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '16px' }}>
        <div className="form-group" style={{ width: '110px' }}>
          <label>Cuántos</label>
          <input type="number" min={1} max={MAX_BATCH} value={count} onChange={e => setCount(e.target.value ? Math.floor(Number(e.target.value)) : '')} />
        </div>
        <div className="form-group" style={{ width: '140px' }}>
          <label>Precio final (€)</label>
          <input type="number" min={0} step="0.01" value={price} placeholder="175" onChange={e => setPrice(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <div className="form-group" style={{ flex: 1, minWidth: '160px' }}>
          <label>Nota (opcional)</label>
          <input value={note} maxLength={120} placeholder="Beca de Juan" onChange={e => setNote(e.target.value)} />
        </div>
        <button type="submit" className="btn-modal-save" disabled={saving}>{saving ? 'Creando…' : 'Crear cupones'}</button>
      </form>

      {error && <p className="modal-error">{error}</p>}

      {loading ? <p style={{ color: '#aaa' }}>Cargando…</p> : coupons.length === 0 ? (
        <p style={{ color: '#aaa' }}>Este evento aún no tiene cupones.</p>
      ) : (
        <>
          {freeCoupons.length > 1 && (
            <button type="button" className="btn-modal-cancel" style={{ marginBottom: '10px' }}
              onClick={() => copy(freeCoupons.map(c => `${c.code} · ${euros(c.price)}${c.note ? ` · ${c.note}` : ''}`).join('\n'), 'all')}>
              <Copy size={14} /> {copied === 'all' ? 'Copiados' : `Copiar los ${freeCoupons.length} libres`}
            </button>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="coupons-table">
              <thead>
                <tr><th>Código</th><th>Precio</th><th>Nota</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {coupons.map(c => {
                  const state = couponState(c, registrations);
                  return (
                    <tr key={c.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                        {c.code}
                        <button type="button" title="Copiar" onClick={() => copy(c.code, c.id)}
                          style={{ background: 'none', border: 'none', color: '#d4af37', cursor: 'pointer', marginLeft: '6px' }}>
                          {copied === c.id ? '✓' : <Copy size={14} />}
                        </button>
                      </td>
                      <td>{c.price === 0 ? 'Gratis' : euros(c.price)}</td>
                      <td>{c.note || ''}</td>
                      <td style={{ color: state.color }}>{state.label}</td>
                      <td>
                        {state.free && (
                          <button type="button" title="Borrar cupón" onClick={() => handleDelete(c)}
                            style={{ background: 'none', border: 'none', color: '#e53935', cursor: 'pointer' }}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
