import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useStore } from './store';
import { Appointment, AppointmentBlock, AppointmentProvider, AppointmentStatus, WeeklyHours } from '../domain/entities';
import { AppointmentsAdapter, ProviderDraft } from '../infrastructure/AppointmentsAdapter';
import { addDays, formatDayLong, isoWeekday, madridDay, madridTime, madridToDate, madridToday } from '../utils/madrid';
import './AppointmentsAdmin.css';

const adapter = new AppointmentsAdapter();

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const SERVICES = ['Fisioterapia', 'Recuperación'];
const STATUS: Record<AppointmentStatus, { label: string; color: string }> = {
  booked: { label: 'Reservada', color: '#d4af37' },
  done: { label: 'Hecha', color: '#10b981' },
  no_show: { label: 'No vino', color: '#e53935' },
  cancelled: { label: 'Cancelada', color: '#777' },
};

const emptyDraft = (userId: string, name = ''): ProviderDraft => ({
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
});

/**
 * Pestaña "Citas" del panel. Un fisio gestiona su calendario (agenda, horario y bloqueos);
 * un admin elige cualquier calendario y puede crear el de cada fisio.
 */
export function AppointmentsAdmin({ systemUsers }: { systemUsers: { id: string; email: string; role: string }[] }) {
  const { user } = useStore();
  const isAdmin = user?.role === 'admin';
  const [providers, setProviders] = useState<AppointmentProvider[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [section, setSection] = useState<'agenda' | 'settings' | 'blocks'>('agenda');
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
  const physios = systemUsers.filter(u => u.role === 'fisio' && !providers.some(p => p.user_id === u.id));

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
        {physios.length === 0 ? (
          <p className="appt-admin-muted">
            Primero da el rol <b>Fisio</b> a la persona en la pestaña Usuarios. Cada fisio tiene un calendario.
          </p>
        ) : (
          <NewProviderForm physios={physios} onSaved={p => { setCreating(false); load(p.id); }} />
        )}
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
        {(['agenda', 'settings', 'blocks'] as const).map(s => (
          <button key={s} className={section === s ? 'active' : ''} onClick={() => setSection(s)}>
            {s === 'agenda' ? 'Agenda' : s === 'settings' ? 'Horario y ajustes' : 'Días cerrados'}
          </button>
        ))}
      </div>

      {error && <p className="appt-admin-error">{error}</p>}
      {selected && section === 'agenda' && <Agenda key={selected.id} provider={selected} />}
      {selected && section === 'settings' && (
        <ProviderSettings key={selected.id} draft={selected} id={selected.id} canDelete={isAdmin}
          onSaved={p => load(p.id)} onDeleted={() => load()} />
      )}
      {selected && section === 'blocks' && <Blocks key={selected.id} provider={selected} />}
    </div>
  );
}

function NewProviderForm({ physios, onSaved }: { physios: { id: string; email: string }[]; onSaved: (p: AppointmentProvider) => void }) {
  const [userId, setUserId] = useState(physios[0].id);
  return (
    <>
      <label className="appt-admin-field">Fisio
        <select value={userId} onChange={e => setUserId(e.target.value)}>
          {physios.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
        </select>
      </label>
      <ProviderSettings key={userId} draft={emptyDraft(userId)} onSaved={onSaved} />
    </>
  );
}

/** Horario semanal, duración y reglas de reserva de un calendario. */
function ProviderSettings({ draft, id, canDelete, onSaved, onDeleted }: {
  draft: ProviderDraft | AppointmentProvider; id?: string; canDelete?: boolean;
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
    for (const [day, ranges] of Object.entries(form.weekly_hours)) {
      const sorted = [...ranges].sort((a, b) => a[0].localeCompare(b[0]));
      for (let i = 0; i < sorted.length; i++) {
        const [from, to] = sorted[i];
        if (!from || !to || from >= to) return `${DAY_NAMES[Number(day) - 1]}: cada tramo tiene que empezar antes de acabar.`;
        if (i > 0 && from < sorted[i - 1][1]) return `${DAY_NAMES[Number(day) - 1]}: hay tramos que se solapan.`;
      }
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
      <label className="appt-admin-field">Descripción (opcional)
        <textarea value={form.description || ''} maxLength={1000} rows={2} onChange={e => set('description', e.target.value)}
          placeholder="Dónde es la consulta, qué traer…" />
      </label>

      <h4>Horario semanal <span className="appt-admin-muted">(hora de Madrid)</span></h4>
      <div className="appt-week">
        {DAY_NAMES.map((name, i) => {
          const day = String(i + 1);
          const ranges = form.weekly_hours[day] || [];
          return (
            <div key={day} className="appt-week-day">
              <label className="appt-week-toggle">
                <input type="checkbox" checked={ranges.length > 0}
                  onChange={e => setRanges(day, e.target.checked ? [['09:00', '14:00']] : [])} />
                {name}
              </label>
              <div className="appt-week-ranges">
                {ranges.length === 0 ? <span className="appt-admin-muted">Sin citas</span> : ranges.map((r, j) => (
                  <span key={j} className="appt-range">
                    <input type="time" value={r[0]} step={300} onChange={e => setRanges(day, ranges.map((x, k) => k === j ? [e.target.value, x[1]] : x))} />
                    –
                    <input type="time" value={r[1]} step={300} onChange={e => setRanges(day, ranges.map((x, k) => k === j ? [x[0], e.target.value] : x))} />
                    <button type="button" title="Quitar tramo" onClick={() => setRanges(day, ranges.filter((_, k) => k !== j))}><Trash2 size={14} /></button>
                  </span>
                ))}
                {ranges.length > 0 && ranges.length < 6 && (
                  <button type="button" className="appt-admin-link" onClick={() => setRanges(day, [...ranges, [ranges[ranges.length - 1][1], '20:00']])}>
                    <Plus size={14} /> Tramo
                  </button>
                )}
              </div>
            </div>
          );
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
        <label className="appt-admin-field">El usuario puede cancelar hasta
          <select value={form.cancel_hours} onChange={e => set('cancel_hours', Number(e.target.value))}>
            {[0, 2, 6, 12, 24, 48].map(h => <option key={h} value={h}>{h === 0 ? 'La misma hora' : `${h} h antes`}</option>)}
          </select>
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
  const visible = appointments.filter(a => showCancelled || a.status !== 'cancelled');

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
                      {a.notes && <span className="appt-agenda-notes">{a.notes}</span>}
                    </div>
                    <div className="appt-agenda-actions">
                      <span style={{ color: STATUS[a.status].color }}>{STATUS[a.status].label}</span>
                      {a.status === 'booked' ? (
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
      await adapter.book(provider.id, madridToDate(day, time).toISOString(), name, notes);
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
