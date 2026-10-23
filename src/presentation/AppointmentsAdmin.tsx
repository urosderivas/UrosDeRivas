import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useStore } from './store';
import { Appointment, AppointmentBlock, AppointmentProvider, AppointmentStatus, DayHours, WeeklyHours } from '../domain/entities';
import { AppointmentsAdapter, ProviderDraft } from '../infrastructure/AppointmentsAdapter';
import { addDays, formatDayLong, isoWeekday, madridDay, madridTime, madridToDate, madridToday } from '../utils/madrid';
import { awaitingPayment, paymentLapsed } from './Appointments';
import './AppointmentsAdmin.css';

const adapter = new AppointmentsAdapter();

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const SERVICES = ['Fisioterapia', 'Recuperación'];
const STATUS: Record<AppointmentStatus, { label: string; color: string }> = {
  booked: { label: 'Reservada', color: 'var(--accent-text)' },
  done: { label: 'Hecha', color: 'var(--success-text)' },
  no_show: { label: 'No vino', color: '#e53935' },
  cancelled: { label: 'Cancelada', color: 'var(--text-muted)' },
};

const SECTION_LABELS = { agenda: 'Agenda', weeks: 'Semana a semana', settings: 'Horario habitual y ajustes', blocks: 'Días cerrados' };

const emptyDraft = (userId: string | null, name = ''): ProviderDraft => ({
  user_id: userId,
  name,
  service: SERVICES[0],
  description: '',
  duration_minutes: 45,
  weekly_hours: { '1': [['09:00', '14:00']], '2': [['09:00', '14:00']], '3': [['09:00', '14:00']], '4': [['09:00', '14:00']], '5': [['09:00', '14:00']] },
  min_notice_hours: 12,
  max_days_ahead: 30,
  cancel_hours: 24,
  active: true,
  price: 0,
});

type Ranges = [string, string][];

/** Tramos ordenados, para comparar dos horarios de un día. */
const sameRanges = (a: Ranges = [], b: Ranges = []) =>
  JSON.stringify([...a].sort((x, y) => x[0].localeCompare(y[0]))) === JSON.stringify([...b].sort((x, y) => x[0].localeCompare(y[0])));

/** Mensaje si los tramos de un día no valen (vacío si están bien). */
function rangesProblem(label: string, ranges: Ranges): string {
  const sorted = [...ranges].sort((a, b) => a[0].localeCompare(b[0]));
  for (let i = 0; i < sorted.length; i++) {
    const [from, to] = sorted[i];
    if (!from || !to || from >= to) return `${label}: cada tramo tiene que empezar antes de acabar.`;
    if (i > 0 && from < sorted[i - 1][1]) return `${label}: hay tramos que se solapan.`;
  }
  return '';
}

/**
 * Pestaña "Citas" del panel. Un fisio gestiona su calendario (agenda, horario y bloqueos);
 * un admin elige cualquier calendario, los crea y decide qué fisio lleva cada uno (o ninguno).
 */
export function AppointmentsAdmin({ systemUsers }: { systemUsers: { id: string; email: string; role: string }[] }) {
  const { user } = useStore();
  const isAdmin = user?.role === 'admin';
  const [providers, setProviders] = useState<AppointmentProvider[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [section, setSection] = useState<keyof typeof SECTION_LABELS>('agenda');
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (keep?: string) => {
    setLoading(true);
    try {
      const all = await adapter.getProviders();
      // Un fisio solo gestiona el suyo (los demás activos también se leen, para la web)
      const mine = isAdmin ? all : all.filter(p => p.user_id === user?.id);
      setProviders(mine);
      setSelectedId(prev => keep || (mine.some(p => p.id === prev) ? prev : mine[0]?.id || ''));
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const selected = providers.find(p => p.id === selectedId) || null;
  // Fisios que pueden llevar un calendario: los que aún no tienen uno, más el que ya lo lleva
  const ownerOptions = (current: string | null) => systemUsers.filter(u =>
    u.id === current || (u.role === 'fisio' && !providers.some(p => p.user_id === u.id)));

  if (loading) return <p className="appt-admin-muted">Cargando calendarios…</p>;

  if (creating || providers.length === 0) {
    if (!isAdmin && providers.length === 0) {
      return (
        <div className="appt-admin">
          <h3>Configura tu calendario</h3>
          <p className="appt-admin-muted">Pon tu nombre, el servicio y tu horario. En cuanto lo guardes, los usuarios podrán reservar en la página Citas.</p>
          <ProviderSettings draft={emptyDraft(user!.id)} onSaved={p => load(p.id)} />
        </div>
      );
    }
    return (
      <div className="appt-admin">
        <h3>Nuevo calendario</h3>
        <ProviderSettings draft={emptyDraft(null)} owners={ownerOptions(null)} onSaved={p => { setCreating(false); load(p.id); }} />
        {providers.length > 0 && <button className="appt-admin-link" onClick={() => setCreating(false)}>Volver</button>}
        {error && <p className="appt-admin-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="appt-admin">
      <div className="appt-admin-top">
        {providers.length > 1 || isAdmin ? (
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
            {providers.map(p => <option key={p.id} value={p.id}>{p.service} · {p.name}{p.active ? '' : ' (oculto)'}</option>)}
          </select>
        ) : <h3>{selected?.service} · {selected?.name}</h3>}
        {isAdmin && <button className="appt-admin-link" onClick={() => setCreating(true)}><Plus size={14} /> Nuevo calendario</button>}
      </div>

      <div className="appt-admin-sections">
        {(['agenda', 'weeks', 'settings', 'blocks'] as const).map(s => (
          <button key={s} className={section === s ? 'active' : ''} onClick={() => setSection(s)}>
            {SECTION_LABELS[s]}
          </button>
        ))}
      </div>

      {error && <p className="appt-admin-error">{error}</p>}
      {selected && section === 'agenda' && <Agenda key={selected.id} provider={selected} />}
      {selected && section === 'weeks' && <WeekHours key={selected.id} provider={selected} />}
      {selected && section === 'settings' && (
        <ProviderSettings key={selected.id} draft={selected} id={selected.id} canDelete={isAdmin}
          owners={isAdmin ? ownerOptions(selected.user_id) : undefined}
          onSaved={p => load(p.id)} onDeleted={() => load()} />
      )}
      {selected && section === 'blocks' && <Blocks key={selected.id} provider={selected} />}
    </div>
  );
}

/** Horario semanal, duración y reglas de reserva de un calendario. */
function ProviderSettings({ draft, id, canDelete, owners, onSaved, onDeleted }: {
  draft: ProviderDraft | AppointmentProvider; id?: string; canDelete?: boolean;
  /** Solo para admins: a qué fisio se puede asignar */
  owners?: { id: string; email: string }[];
  onSaved: (p: AppointmentProvider) => void; onDeleted?: () => void;
}) {
  const [form, setForm] = useState<ProviderDraft>(() => {
    const { id: _id, ...rest } = draft as AppointmentProvider;
    return { ...rest, description: rest.description || '' };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof ProviderDraft>(k: K, v: ProviderDraft[K]) => { setForm(f => ({ ...f, [k]: v })); setSaved(false); };

  const setRanges = (day: string, ranges: [string, string][]) => {
    const hours: WeeklyHours = { ...form.weekly_hours };
    if (ranges.length) hours[day] = ranges; else delete hours[day];
    set('weekly_hours', hours);
  };

  const validate = (): string => {
    if (!form.name.trim()) return 'Pon el nombre que verán los usuarios.';
    if (!form.service.trim()) return 'Pon el servicio (por ejemplo Fisioterapia).';
    if (!Number.isFinite(form.price) || form.price < 0 || form.price > 1000) return 'El precio tiene que estar entre 0 y 1000 €.';
    for (const [day, ranges] of Object.entries(form.weekly_hours)) {
      const problem = rangesProblem(DAY_NAMES[Number(day) - 1], ranges);
      if (problem) return problem;
    }
    return '';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSaving(true); setError('');
    const payload = { ...form, name: form.name.trim(), service: form.service.trim(), description: form.description?.trim() || null };
    try {
      const result = id ? await adapter.updateProvider(id, payload) : await adapter.createProvider(payload);
      setSaved(true);
      onSaved(result);
    } catch (err: any) { setError(err.message); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('¿Borrar este calendario y TODAS sus citas? Si solo quieres que no se pueda reservar, desmarca "Visible en la web".')) return;
    try { await adapter.deleteProvider(id); onDeleted?.(); } catch (err: any) { setError(err.message); }
  };

  return (
    <form className="appt-settings" onSubmit={handleSave}>
      <div className="appt-settings-row">
        <label className="appt-admin-field">Nombre que ven los usuarios *
          <input value={form.name} maxLength={80} required onChange={e => set('name', e.target.value)} placeholder="Laura García" />
        </label>
        <label className="appt-admin-field">Servicio *
          <input value={form.service} maxLength={60} required list="appt-services" onChange={e => set('service', e.target.value)} />
          <datalist id="appt-services">{SERVICES.map(s => <option key={s} value={s} />)}</datalist>
        </label>
      </div>
      {owners && (
        <label className="appt-admin-field">Quién lo lleva
          <select value={form.user_id || ''} onChange={e => set('user_id', e.target.value || null)}>
            <option value="">Administración (sin fisio)</option>
            {owners.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
          <span className="appt-admin-muted">
            El fisio asignado gestiona este calendario desde su cuenta; los admins siempre pueden. Para que alguien salga en la lista, dale el rol Fisio en Usuarios.
          </span>
        </label>
      )}
      <label className="appt-admin-field">Descripción (opcional)
        <textarea value={form.description || ''} maxLength={1000} rows={2} onChange={e => set('description', e.target.value)}
          placeholder="Dónde es la consulta, qué traer…" />
      </label>

      <h4>Horario habitual <span className="appt-admin-muted">(hora de Madrid; para cambiar una semana concreta, usa "Semana a semana")</span></h4>
      <div className="appt-week">
        {DAY_NAMES.map((name, i) => {
          const day = String(i + 1);
          return <RangesEditor key={day} label={name} ranges={form.weekly_hours[day] || []} onChange={r => setRanges(day, r)} />;
        })}
      </div>

      <div className="appt-settings-row">
        <label className="appt-admin-field">Duración de cada cita
          <select value={form.duration_minutes} onChange={e => set('duration_minutes', Number(e.target.value))}>
            {[15, 20, 30, 40, 45, 50, 60, 75, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
        <label className="appt-admin-field">Antelación mínima para reservar
          <select value={form.min_notice_hours} onChange={e => set('min_notice_hours', Number(e.target.value))}>
            {[0, 1, 2, 4, 12, 24, 48].map(h => <option key={h} value={h}>{h === 0 ? 'Ninguna' : `${h} h`}</option>)}
          </select>
        </label>
        <label className="appt-admin-field">Se puede reservar hasta
          <select value={form.max_days_ahead} onChange={e => set('max_days_ahead', Number(e.target.value))}>
            {[7, 14, 21, 30, 45, 60, 90].map(d => <option key={d} value={d}>{d} días vista</option>)}
          </select>
        </label>
        <label className="appt-admin-field">Precio por cita (€)
          <input type="number" min={0} max={1000} step="0.01" value={form.price}
            onChange={e => set('price', e.target.value === '' ? 0 : Number(e.target.value))} />
          <span className="appt-admin-muted">{form.price > 0 ? 'Se paga por transferencia: la cita queda pendiente hasta que la marques como pagada.' : '0 = gratis, sin pago.'}</span>
        </label>
        <label className="appt-admin-field">El usuario puede cancelar hasta
          <select value={form.cancel_hours} onChange={e => set('cancel_hours', Number(e.target.value))}>
            {[0, 2, 6, 12, 24, 48].map(h => <option key={h} value={h}>{h === 0 ? 'La misma hora' : `${h} h antes`}</option>)}
          </select>
          {form.price > 0 && <span className="appt-admin-muted">Solo las gratis: las pagadas se cancelan hablando con el club.</span>}
        </label>
      </div>

      <label className="appt-week-toggle">
        <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
        Visible en la web (si lo desmarcas, nadie puede reservar; las citas que ya hay se mantienen)
      </label>

      {error && <p className="appt-admin-error">{error}</p>}
      <div className="appt-settings-actions">
        <button type="submit" className="btn-modal-save" disabled={saving}>{saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar'}</button>
        {id && canDelete && <button type="button" className="appt-admin-danger" onClick={handleDelete}>Borrar calendario</button>}
      </div>
    </form>
  );
}

/** Un día del horario: casilla "hay citas" y sus tramos (hasta 6). */
function RangesEditor({ label, ranges, onChange, disabled, whenChecked = [['09:00', '14:00']], children }: {
  label: string; ranges: Ranges; onChange: (r: Ranges) => void; disabled?: boolean; whenChecked?: Ranges; children?: React.ReactNode;
}) {
  return (
    <div className={`appt-week-day ${disabled ? 'past' : ''}`}>
      <label className="appt-week-toggle">
        <input type="checkbox" checked={ranges.length > 0} disabled={disabled}
          onChange={e => onChange(e.target.checked ? (whenChecked.length ? whenChecked : [['09:00', '14:00']]) : [])} />
        {label}
      </label>
      <div className="appt-week-ranges">
        {ranges.length === 0 ? <span className="appt-admin-muted">Sin citas</span> : ranges.map((r, j) => (
          <span key={j} className="appt-range">
            <input type="time" value={r[0]} step={300} disabled={disabled} onChange={e => onChange(ranges.map((x, k) => k === j ? [e.target.value, x[1]] : x))} />
            –
            <input type="time" value={r[1]} step={300} disabled={disabled} onChange={e => onChange(ranges.map((x, k) => k === j ? [x[0], e.target.value] : x))} />
            {!disabled && <button type="button" title="Quitar tramo" onClick={() => onChange(ranges.filter((_, k) => k !== j))}><Trash2 size={14} /></button>}
          </span>
        ))}
        {!disabled && ranges.length > 0 && ranges.length < 6 && (
          <button type="button" className="appt-admin-link" onClick={() => onChange([...ranges, [ranges[ranges.length - 1][1], '20:00']])}>
            <Plus size={14} /> Tramo
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * Semana a semana: el horario de una semana concreta (p. ej. el jueves en vez del viernes).
 * Lo que coincide con el horario habitual no se guarda aparte, así que si luego cambia el habitual, esos días también.
 */
function WeekHours({ provider }: { provider: AppointmentProvider }) {
  const today = madridToday();
  const thisWeek = addDays(today, 1 - isoWeekday(today));
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [stored, setStored] = useState<DayHours>({});
  const [week, setWeek] = useState<DayHours>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const habitual = (day: string): Ranges => provider.weekly_hours[String(isoWeekday(day))] || [];

  const load = async () => {
    setLoading(true); setError('');
    try {
      const found = await adapter.getDayHours(provider.id, days[0], days[6]);
      setStored(found);
      setWeek(Object.fromEntries(days.map(d => [d, found[d] ?? habitual(d)])));
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [weekStart, provider.id]);

  const dirty = !loading && days.some(d => !sameRanges(week[d], stored[d] ?? habitual(d)));

  const go = (start: string) => {
    if (dirty && !window.confirm('Hay cambios sin guardar en esta semana. ¿Salir sin guardarlos?')) return;
    setNotice('');
    setWeekStart(start);
  };

  /** Lo que hay que guardar para que `targetDays` queden con `ranges`: null = como el habitual. */
  const changes = (targetDays: string[], ranges: Ranges[], current: DayHours) => {
    const out: Record<string, Ranges | null> = {};
    targetDays.forEach((d, i) => {
      if (d < today) return;
      if (sameRanges(ranges[i], habitual(d))) { if (current[d]) out[d] = null; }
      else if (!current[d] || !sameRanges(ranges[i], current[d])) out[d] = ranges[i];
    });
    return out;
  };

  const validate = () => {
    for (const d of days) {
      const problem = rangesProblem(formatDayLong(d), week[d] || []);
      if (problem) return problem;
    }
    return '';
  };

  const handleSave = async () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      await adapter.saveDayHours(provider.id, changes(days, days.map(d => week[d] || []), stored));
      await load();
      setNotice('✓ Semana guardada');
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleCopyNext = async () => {
    const next = days.map(d => addDays(d, 7));
    setSaving(true); setError(''); setNotice('');
    try {
      const nextStored = await adapter.getDayHours(provider.id, next[0], next[6]);
      await adapter.saveDayHours(provider.id, changes(next, days.map(d => week[d] || []), nextStored));
      setWeekStart(next[0]);
      setNotice('✓ Copiada a esta semana');
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const changedDays = days.filter(d => !sameRanges(week[d], habitual(d)));

  return (
    <div className="appt-agenda">
      <p className="appt-admin-muted">
        Cambia el horario solo de una semana (por ejemplo, el jueves en vez del viernes). Los días que no toques siguen el horario habitual.
        Para vacaciones o varios días seguidos, usa "Días cerrados".
      </p>
      <div className="appt-agenda-nav">
        <button onClick={() => go(addDays(weekStart, -7))} aria-label="Semana anterior" disabled={weekStart <= thisWeek}><ChevronLeft size={18} /></button>
        <b>Semana del {formatDayLong(weekStart).toLowerCase()}</b>
        <button onClick={() => go(addDays(weekStart, 7))} aria-label="Semana siguiente"><ChevronRight size={18} /></button>
        {weekStart !== thisWeek && <button className="appt-admin-link" onClick={() => go(thisWeek)}>Esta semana</button>}
      </div>

      {loading ? <p className="appt-admin-muted">Cargando…</p> : (
        <div className="appt-week dated">
          {days.map(d => {
            const past = d < today;
            const changed = !sameRanges(week[d], habitual(d));
            return (
              <RangesEditor key={d} label={formatDayLong(d)} ranges={week[d] || []} disabled={past} whenChecked={habitual(d)}
                onChange={r => { setWeek(w => ({ ...w, [d]: r })); setNotice(''); }}>
                {changed && <span className="appt-week-badge">Solo esta semana</span>}
                {changed && !past && (
                  <button type="button" className="appt-admin-link" onClick={() => { setWeek(w => ({ ...w, [d]: habitual(d) })); setNotice(''); }}>
                    Volver al habitual
                  </button>
                )}
              </RangesEditor>
            );
          })}
        </div>
      )}

      {error && <p className="appt-admin-error">{error}</p>}
      <div className="appt-settings-actions">
        <button className="btn-modal-save" onClick={handleSave} disabled={saving || loading || !dirty}>
          {saving ? 'Guardando…' : 'Guardar semana'}
        </button>
        <button className="appt-admin-link" onClick={handleCopyNext} disabled={saving || loading || dirty || changedDays.length === 0}
          title={dirty ? 'Guarda antes la semana' : ''}>
          Copiar esta semana a la siguiente
        </button>
        {notice && <span className="appt-admin-muted">{notice}</span>}
      </div>
      <p className="appt-admin-muted">Las citas ya reservadas no se mueven ni se cancelan solas: si quitas un día con citas, revísalas en la Agenda.</p>
    </div>
  );
}

/** Semana a semana: las citas del calendario, con acciones y "Añadir cita". */
function Agenda({ provider }: { provider: AppointmentProvider }) {
  const today = madridToday();
  const [weekStart, setWeekStart] = useState(addDays(today, 1 - isoWeekday(today)));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showCancelled, setShowCancelled] = useState(false);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setAppointments(await adapter.getAgenda(provider.id, madridToDate(weekStart, '00:00'), madridToDate(addDays(weekStart, 7), '00:00')));
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [weekStart, provider.id]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  // Un apartado que no se llegó a pagar cuenta como cancelado
  const visible = appointments.filter(a => showCancelled || (a.status !== 'cancelled' && !paymentLapsed(a)));

  const act = async (fn: () => Promise<void>) => {
    setError('');
    try { await fn(); await load(); } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="appt-agenda">
      <div className="appt-agenda-nav">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semana anterior"><ChevronLeft size={18} /></button>
        <b>Semana del {formatDayLong(weekStart).toLowerCase()}</b>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Semana siguiente"><ChevronRight size={18} /></button>
        <button className="appt-admin-link" onClick={() => setWeekStart(addDays(today, 1 - isoWeekday(today)))}>Hoy</button>
        <label className="appt-week-toggle"><input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} /> Ver canceladas</label>
        <button className="btn-modal-save" onClick={() => setAdding(true)}><Plus size={14} /> Añadir cita</button>
      </div>

      {adding && <AddAppointment provider={provider} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
      {error && <p className="appt-admin-error">{error}</p>}
      {loading ? <p className="appt-admin-muted">Cargando…</p> : (
        <div className="appt-agenda-days">
          {days.map(d => {
            const list = visible.filter(a => madridDay(a.starts_at) === d);
            return (
              <div key={d} className={`appt-agenda-day ${d === today ? 'today' : ''}`}>
                <h4>{formatDayLong(d)}</h4>
                {list.length === 0 ? <p className="appt-admin-muted">—</p> : list.map(a => (
                  <div key={a.id} className="appt-agenda-item" style={{ borderLeftColor: STATUS[a.status].color }}>
                    <div className="appt-agenda-time">{madridTime(a.starts_at)}–{madridTime(a.ends_at)}</div>
                    <div className="appt-agenda-who">
                      <b>{a.patient_name}</b>
                      <span>{a.user_email || 'Apuntada por el club'}</span>
                      {a.payment === 'paid' && <span className="appt-paid">Pagada {Number(a.amount).toFixed(2).replace('.', ',')} €{a.status === 'cancelled' ? ' · hay que devolver el pago' : ''}</span>}
                      {awaitingPayment(a) && <span className="appt-admin-muted">Transferencia de {Number(a.amount).toFixed(2).replace('.', ',')} € · concepto {a.stripe_session_id}</span>}
                      {a.notes && <span className="appt-agenda-notes">{a.notes}</span>}
                    </div>
                    <div className="appt-agenda-actions">
                      {awaitingPayment(a) ? <span style={{ color: 'var(--warning-text)' }}>Pendiente de pago</span>
                        : paymentLapsed(a) ? <span style={{ color: STATUS.cancelled.color }}>Sin pagar</span>
                        : <span style={{ color: STATUS[a.status].color }}>{STATUS[a.status].label}</span>}
                      {awaitingPayment(a) ? (
                        <>
                          <button onClick={() => act(() => adapter.setPayment(a.id, true))}>Pagada</button>
                          <button className="danger" onClick={() => window.confirm(`¿Cancelar la cita de ${a.patient_name}? El hueco queda libre.`) && act(() => adapter.cancel(a.id))}>Cancelar</button>
                        </>
                      ) : paymentLapsed(a) ? null : a.status === 'booked' ? (
                        <>
                          <button onClick={() => act(() => adapter.setStatus(a.id, 'done'))}>Hecha</button>
                          <button onClick={() => act(() => adapter.setStatus(a.id, 'no_show'))}>No vino</button>
                          <button className="danger" onClick={() => window.confirm(`¿Cancelar la cita de ${a.patient_name}?`) && act(() => adapter.cancel(a.id))}>Cancelar</button>
                        </>
                      ) : (
                        <button onClick={() => act(() => adapter.setStatus(a.id, 'booked'))}>Volver a reservada</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** El fisio apunta una cita (por teléfono, en persona…): cualquier hora que no choque con otra. */
function AddAppointment({ provider, onClose, onSaved }: { provider: AppointmentProvider; onClose: () => void; onSaved: () => void }) {
  const [day, setDay] = useState(madridToday());
  const [time, setTime] = useState('10:00');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await adapter.addByStaff(provider.id, madridToDate(day, time).toISOString(), name, notes);
      onSaved();
    } catch (err: any) { setError(err.message); }
    setSaving(false);
  };

  return (
    <form className="appt-add" onSubmit={handleSave}>
      <label className="appt-admin-field">Día<input type="date" value={day} required onChange={e => setDay(e.target.value)} /></label>
      <label className="appt-admin-field">Hora<input type="time" value={time} required step={300} onChange={e => setTime(e.target.value)} /></label>
      <label className="appt-admin-field">Nombre *<input value={name} maxLength={100} required onChange={e => setName(e.target.value)} /></label>
      <label className="appt-admin-field" style={{ flex: 2 }}>Nota<input value={notes} maxLength={500} onChange={e => setNotes(e.target.value)} placeholder="Teléfono, motivo…" /></label>
      <div className="appt-settings-actions">
        <button type="submit" className="btn-modal-save" disabled={saving}>{saving ? 'Guardando…' : `Guardar (${provider.duration_minutes} min)`}</button>
        <button type="button" className="btn-modal-cancel" onClick={onClose}>Cancelar</button>
      </div>
      {error && <p className="appt-admin-error" style={{ width: '100%' }}>{error}</p>}
    </form>
  );
}

/** Días u horas cerrados: vacaciones, un torneo… En ese tiempo no se puede reservar. */
function Blocks({ provider }: { provider: AppointmentProvider }) {
  const [blocks, setBlocks] = useState<AppointmentBlock[]>([]);
  const [fromDay, setFromDay] = useState(madridToday());
  const [toDay, setToDay] = useState(madridToday());
  const [allDay, setAllDay] = useState(true);
  const [fromTime, setFromTime] = useState('09:00');
  const [toTime, setToTime] = useState('14:00');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try { setBlocks(await adapter.getBlocks(provider.id)); } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { load(); }, [provider.id]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const start = madridToDate(fromDay, allDay ? '00:00' : fromTime);
    const end = allDay ? madridToDate(addDays(toDay, 1), '00:00') : madridToDate(toDay, toTime);
    try { await adapter.addBlock(provider.id, start, end, note); setNote(''); load(); } catch (err: any) { setError(err.message); }
  };

  const describe = (b: AppointmentBlock) => {
    const sameDay = madridDay(b.starts_at) === madridDay(new Date(new Date(b.ends_at).getTime() - 1));
    const wholeDays = madridTime(b.starts_at) === '00:00' && madridTime(b.ends_at) === '00:00';
    if (wholeDays) {
      const last = madridDay(new Date(new Date(b.ends_at).getTime() - 1));
      return sameDay ? formatDayLong(madridDay(b.starts_at)) : `${formatDayLong(madridDay(b.starts_at))} – ${formatDayLong(last)}`;
    }
    return `${formatDayLong(madridDay(b.starts_at))} ${madridTime(b.starts_at)} – ${sameDay ? '' : formatDayLong(madridDay(b.ends_at)) + ' '}${madridTime(b.ends_at)}`;
  };

  return (
    <div className="appt-blocks">
      <form className="appt-add" onSubmit={handleAdd}>
        <label className="appt-admin-field">Desde<input type="date" value={fromDay} required onChange={e => { setFromDay(e.target.value); if (e.target.value > toDay) setToDay(e.target.value); }} /></label>
        {!allDay && <label className="appt-admin-field">Hora<input type="time" value={fromTime} step={300} onChange={e => setFromTime(e.target.value)} /></label>}
        <label className="appt-admin-field">Hasta<input type="date" value={toDay} min={fromDay} required onChange={e => setToDay(e.target.value)} /></label>
        {!allDay && <label className="appt-admin-field">Hora<input type="time" value={toTime} step={300} onChange={e => setToTime(e.target.value)} /></label>}
        <label className="appt-admin-field" style={{ flex: 2 }}>Motivo (solo lo ves tú)<input value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="Vacaciones" /></label>
        <label className="appt-week-toggle"><input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} /> Días enteros</label>
        <button type="submit" className="btn-modal-save">Cerrar</button>
      </form>
      {error && <p className="appt-admin-error">{error}</p>}
      <p className="appt-admin-muted">Las citas que ya estén reservadas en esas fechas no se cancelan solas: revísalas en la agenda.</p>
      {blocks.length === 0 ? <p className="appt-admin-muted">No hay días cerrados.</p> : (
        <ul className="appt-block-list">
          {blocks.map(b => (
            <li key={b.id}>
              <span><b>{describe(b)}</b>{b.note ? ` · ${b.note}` : ''}</span>
              <button title="Volver a abrir" onClick={async () => { try { await adapter.deleteBlock(b.id); load(); } catch (e: any) { setError(e.message); } }}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
