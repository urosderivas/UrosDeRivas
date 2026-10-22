import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, CalendarDays } from 'lucide-react';
import { useStore } from './store';
import { Appointment, AppointmentProvider } from '../domain/entities';
import { AppointmentsAdapter } from '../infrastructure/AppointmentsAdapter';
import { StripeAdapter } from '../infrastructure/StripeAdapter';
import { addDays, formatDayLong, formatMonth, isoWeekday, madridDay, madridTime, madridToday } from '../utils/madrid';
import './Appointments.css';

const adapter = new AppointmentsAdapter();
const stripe = new StripeAdapter();
const euros = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(2)} €`;

/** Apartada para pagar y el pago aún puede llegar (hasta hold_until). */
export const awaitingPayment = (a: Appointment) =>
  a.status === 'booked' && a.payment === 'pending' && !!a.hold_until && new Date(a.hold_until).getTime() > Date.now();
/** Apartada para pagar, pero el pago no se completó a tiempo. */
export const paymentLapsed = (a: Appointment) =>
  a.payment === 'failed' || (a.payment === 'pending' && !awaitingPayment(a));
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const STATUS_LABELS: Record<string, string> = {
  booked: 'Reservada', done: 'Hecha', no_show: 'No asistió', cancelled: 'Cancelada',
};

/** Primer día del mes de un día "2026-11-06" → "2026-11-01". */
const monthStart = (day: string) => `${day.slice(0, 8)}01`;
/** Último día del mes de un día. */
function monthEnd(day: string): string {
  const [y, m] = day.split('-').map(Number);
  return addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1);
}

/** Reserva de citas de fisioterapia y recuperación, al estilo de Calendly. */
export function Appointments() {
  const { user } = useStore();
  const [providers, setProviders] = useState<AppointmentProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AppointmentProvider | null>(null);
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [notice, setNotice] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const loadMine = async () => {
    if (!user) { setMyAppointments([]); return; }
    try { setMyAppointments(await adapter.getMyAppointments(user.id)); } catch { /* sin lista, no pasa nada */ }
  };

  useEffect(() => {
    adapter.getProviders()
      .then(list => setProviders(list.filter(p => p.active)))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadMine(); }, [user?.id]);

  // Vuelta de Stripe: pagada (el aviso de Stripe la confirma en unos segundos) o cancelada
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('success')) {
      setNotice('✅ Pago hecho: tu cita está reservada. La tienes abajo en "Mis citas".');
      const timers = [2000, 6000].map(ms => setTimeout(loadMine, ms));
      navigate(location.pathname, { replace: true });
      return () => timers.forEach(clearTimeout);
    }
    if (params.get('canceled')) {
      setNotice('Has cancelado el pago. La hora queda libre y no se ha reservado nada.');
      stripe.cancelPendingCheckout().finally(loadMine);
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, user?.id]);

  return (
    <div className="appointments-page">
      <div className="events-header">
        <h1 className="animated-title">Citas</h1>
      </div>

      {error && <p className="appt-error">{error}</p>}
      {notice && <p className="appt-notice">{notice}</p>}

      {selected ? (
        <Booking provider={selected} onBack={() => setSelected(null)} onBooked={loadMine} />
      ) : loading ? (
        <p className="appt-muted">Cargando…</p>
      ) : providers.length === 0 ? (
        <p className="appt-muted">Pronto podrás reservar aquí tus citas de fisioterapia y recuperación.</p>
      ) : (
        <div className="appt-providers">
          {providers.map(p => (
            <button key={p.id} className="appt-provider-card" onClick={() => setSelected(p)}>
              <span className="appt-provider-service">{p.service}</span>
              <span className="appt-provider-name">{p.name}</span>
              <span className="appt-provider-duration"><Clock size={15} /> {p.duration_minutes} min{p.price > 0 ? ` · ${euros(p.price)}` : ''}</span>
              {p.description && <span className="appt-provider-desc">{p.description}</span>}
              <span className="appt-provider-cta">Ver horarios <ChevronRight size={16} /></span>
            </button>
          ))}
        </div>
      )}

      {user && myAppointments.length > 0 && <MyAppointments appointments={myAppointments} onChange={loadMine} />}
    </div>
  );
}

function Booking({ provider, onBack, onBooked }: { provider: AppointmentProvider; onBack: () => void; onBooked: () => void }) {
  const { user } = useStore();
  const today = madridToday();
  const lastDay = addDays(today, provider.max_days_ahead);
  const [month, setMonth] = useState(monthStart(today));
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [booked, setBooked] = useState<string | null>(null);

  const loadSlots = async () => {
    setLoadingSlots(true);
    try { setSlots(await adapter.getAvailableSlots(provider.id, month, monthEnd(month))); }
    catch (e: any) { setError(e.message); }
    setLoadingSlots(false);
  };

  useEffect(() => { loadSlots(); }, [provider.id, month]);

  // Huecos por día de Madrid
  const byDay = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const s of slots) (map[madridDay(s)] ||= []).push(s);
    return map;
  }, [slots]);

  // Al cambiar de mes (o si el día elegido se queda sin huecos) se elige el primer día con huecos
  useEffect(() => {
    if (!day || !byDay[day]) {
      setDay(Object.keys(byDay).sort()[0] || null);
      setSlot(null);
    }
  }, [byDay]);

  const cells = useMemo(() => {
    const start = month;
    const lead = isoWeekday(start) - 1;
    const end = monthEnd(month);
    const days: (string | null)[] = Array(lead).fill(null);
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return days;
  }, [month]);

  const canPrev = month > monthStart(today);
  const canNext = monthStart(addDays(monthEnd(month), 1)) <= lastDay;

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot) return;
    setSaving(true); setError('');
    try {
      if (provider.price > 0) {
        // Se aparta la hora y se paga en Stripe; al volver, la cita sale en "Mis citas"
        window.location.href = await stripe.createAppointmentCheckout({ providerId: provider.id, startsAt: slot, patientName, notes });
        return;
      }
      await adapter.book(provider.id, slot, patientName, notes);
      setBooked(slot);
      onBooked();
    } catch (err: any) {
      setError(err.message);
      setSlot(null);
      loadSlots();
    }
    setSaving(false);
  };

  if (booked) {
    return (
      <div className="appt-booking appt-done">
        <h2>✅ Cita reservada</h2>
        <p><b>{provider.service}</b> con {provider.name}</p>
        <p className="appt-done-when">{formatDayLong(madridDay(booked))} a las {madridTime(booked)}</p>
        <p className="appt-muted">La verás abajo en "Mis citas". Puedes cancelarla hasta {provider.cancel_hours} horas antes.</p>
        <button className="appt-btn" onClick={onBack}>Volver</button>
      </div>
    );
  }

  return (
    <div className="appt-booking">
      <aside className="appt-info">
        <button className="appt-back" onClick={onBack}><ArrowLeft size={16} /> Volver</button>
        <span className="appt-provider-service">{provider.service}</span>
        <h2>{provider.name}</h2>
        <p className="appt-provider-duration"><Clock size={15} /> {provider.duration_minutes} min</p>
        {provider.price > 0 && <p className="appt-info-price">{euros(provider.price)} <span>· se paga al reservar</span></p>}
        {provider.description && <p className="appt-info-desc">{provider.description}</p>}
      </aside>

      <section className="appt-calendar">
        <div className="appt-month">
          <button disabled={!canPrev} onClick={() => setMonth(monthStart(addDays(month, -1)))} aria-label="Mes anterior"><ChevronLeft size={20} /></button>
          <h3>{formatMonth(month)}</h3>
          <button disabled={!canNext} onClick={() => setMonth(addDays(monthEnd(month), 1))} aria-label="Mes siguiente"><ChevronRight size={20} /></button>
        </div>
        <div className="appt-grid">
          {WEEKDAYS.map(w => <span key={w} className="appt-weekday">{w}</span>)}
          {cells.map((d, i) => d ? (
            <button key={d} className={`appt-day ${byDay[d] ? 'available' : ''} ${d === day ? 'selected' : ''} ${d === today ? 'today' : ''}`}
              disabled={!byDay[d]} onClick={() => { setDay(d); setSlot(null); }}>
              {Number(d.slice(8))}
            </button>
          ) : <span key={`e${i}`} />)}
        </div>
        {loadingSlots ? <p className="appt-muted">Buscando huecos…</p>
          : Object.keys(byDay).length === 0 && <p className="appt-muted">No quedan huecos este mes.</p>}
      </section>

      <section className="appt-times">
        {day && byDay[day] ? (
          <>
            <h3>{formatDayLong(day)}</h3>
            <div className="appt-slot-list">
              {byDay[day].map(s => (
                <button key={s} className={`appt-slot ${s === slot ? 'selected' : ''}`} onClick={() => setSlot(s)}>{madridTime(s)}</button>
              ))}
            </div>
          </>
        ) : !loadingSlots && <p className="appt-muted"><CalendarDays size={16} /> Elige un día con huecos.</p>}

        {slot && (
          user ? (
            <form className="appt-form" onSubmit={handleBook}>
              <p className="appt-form-when">{formatDayLong(madridDay(slot))}, {madridTime(slot)}</p>
              <label>Nombre de quien va a la cita *
                <input value={patientName} maxLength={100} required onChange={e => setPatientName(e.target.value)} placeholder="Nombre y apellidos" />
              </label>
              <label>Nota para {provider.name} (opcional)
                <textarea value={notes} maxLength={500} rows={3} onChange={e => setNotes(e.target.value)} placeholder="Motivo de la cita" />
              </label>
              <button type="submit" className="appt-btn" disabled={saving}>
                {saving ? (provider.price > 0 ? 'Abriendo el pago…' : 'Reservando…') : provider.price > 0 ? `Pagar ${euros(provider.price)} y reservar` : 'Reservar cita'}
              </button>
              {provider.price > 0 && <p className="appt-muted">Te guardamos la hora mientras pagas con tarjeta (30 minutos como mucho).</p>}
            </form>
          ) : (
            <p className="appt-login">Para reservar, <Link to="/login?next=/citas">inicia sesión o crea una cuenta</Link>.</p>
          )
        )}
        {error && <p className="appt-error">{error}</p>}
      </section>
    </div>
  );
}

function MyAppointments({ appointments, onChange }: { appointments: Appointment[]; onChange: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const now = Date.now();
  const upcoming = appointments.filter(a => a.status === 'booked' && !paymentLapsed(a) && new Date(a.starts_at).getTime() > now).reverse();
  const past = appointments.filter(a => !upcoming.includes(a)).slice(0, 10);

  const handleCancel = async (a: Appointment) => {
    if (!window.confirm(`¿Cancelar la cita del ${formatDayLong(madridDay(a.starts_at)).toLowerCase()} a las ${madridTime(a.starts_at)}?`)) return;
    setBusy(a.id); setError('');
    try { await adapter.cancel(a.id); onChange(); } catch (e: any) { setError(e.message); }
    setBusy(null);
  };

  const row = (a: Appointment, canCancel: boolean) => {
    const lateToCancel = new Date(a.starts_at).getTime() - now < (a.provider?.cancel_hours ?? 0) * 3600_000;
    return (
      <li key={a.id} className={`appt-mine-row status-${a.status}`}>
        <div>
          <b>{formatDayLong(madridDay(a.starts_at))}, {madridTime(a.starts_at)}</b>
          <span>{a.provider ? `${a.provider.service} · ${a.provider.name}` : ''} · {a.patient_name}</span>
        </div>
        {!canCancel ? <span className="appt-status">{paymentLapsed(a) ? 'Sin pagar' : STATUS_LABELS[a.status]}</span>
          : awaitingPayment(a) ? <span className="appt-status">Pago pendiente</span>
          : a.payment === 'paid' ? <span className="appt-muted">Pagada ({euros(Number(a.amount))}). Para cancelarla, habla con el club.</span>
          : lateToCancel
            ? <span className="appt-muted" title="Fuera de plazo para cancelar desde la web">Habla con el club para cancelar</span>
            : <button className="appt-cancel" disabled={busy === a.id} onClick={() => handleCancel(a)}>Cancelar</button>}
      </li>
    );
  };

  return (
    <section className="appt-mine">
      <h2>Mis citas</h2>
      {error && <p className="appt-error">{error}</p>}
      {upcoming.length > 0 ? <ul>{upcoming.map(a => row(a, true))}</ul> : <p className="appt-muted">No tienes citas pendientes.</p>}
      {past.length > 0 && (
        <details>
          <summary>Anteriores y canceladas</summary>
          <ul>{past.map(a => row(a, false))}</ul>
        </details>
      )}
    </section>
  );
}
