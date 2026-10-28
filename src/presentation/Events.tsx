import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './store';
import { AdminGuard } from './AdminGuard';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { PaymentAdapter, TransferInfo } from '../infrastructure/PaymentAdapter';
import { EventModal } from './EventModal';
import { Event, CustomField, EventType, OwnRegistration } from '../domain/entities';
import { choosesDays, eventOptions, eventTable, isFreeEvent, maxTableAttendees, registrationPrice, registrationTiers, startingPrice, PriceTable } from '../domain/pricing';
import { formatDateRanges } from '../utils/dates';
import { CouponsModal } from './components/CouponsModal';
import { EVENT_PAGES, eventPath } from '../utils/eventLinks';
import { MessageModal } from './components/MessageModal';
import { TransferModal } from './components/TransferDetails';
import { ConfirmModal } from './components/ConfirmModal';
import { fallbackImageUrl, resolveImageUrl } from '../utils/media';
import './Events.css';

const adapter = new SupabaseAdapter();
const payments = new PaymentAdapter();
const MAX_ATTENDEES = 20;

/** Imagen del campus con el logo del club debajo, que se ve si la imagen falta o no carga. */
function campusBackground(imageUrl?: string): CSSProperties {
  const fallback = `url("${fallbackImageUrl}")`;
  if (!imageUrl) return { backgroundImage: fallback, backgroundSize: '140px' };
  return {
    backgroundImage: `url("${resolveImageUrl(imageUrl).replace(/"/g, '%22')}"), ${fallback}`,
    backgroundSize: 'cover, 140px',
  };
}

const euros = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(2)} €`;

/** Tabla de precios que ven las familias antes de inscribirse. */
function PriceTableView({ table, numDates }: { table: PriceTable; numDates: number }) {
  const rows = table.prices.length;
  const cols = table.byDays ? numDates : 1;
  return (
    <div className="price-table-box">
      <div className="price-table-scroll">
        <table className="price-table">
          <thead>
            <tr>
              <th>Asistentes</th>
              {table.byDays
                ? Array.from({ length: cols }, (_, d) => <th key={d}>{d + 1} {d === 0 ? 'día' : 'días'}</th>)
                : <th>Evento completo</th>}
            </tr>
          </thead>
          <tbody>
            {table.prices.map((row, a) => (
              <tr key={a}>
                <th>{a + 1}</th>
                {row.map((p, d) => <td key={d}>{euros(p)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="price-table-note">
        Como máximo {rows} {rows === 1 ? 'asistente' : 'asistentes'} por inscripción.
      </p>
    </div>
  );
}

export function Events({ kind = 'campus' }: { kind?: EventType }) {
  const page = EVENT_PAGES[kind];
  const { user, ensureContact } = useStore();
  const canManage = user?.role === 'admin' || user?.role === 'coach';
  const [events, setEvents] = useState<Event[]>([]);
  const [occupancy, setOccupancy] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<Event | null>(null);
  const [messageAlert, setMessageAlert] = useState<{ open: boolean; title: string; message: string }>({ open: false, title: '', message: '' });
  const [confirmPrompt, setConfirmPrompt] = useState<{ open: boolean; action: (() => void) | null; message: string }>({ open: false, action: null, message: '' });
  const showMessage = (title: string, message: string) => setMessageAlert({ open: true, title, message });
  const [userRegistrations, setUserRegistrations] = useState<OwnRegistration[]>([]);
  const [couponsEvent, setCouponsEvent] = useState<Event | null>(null);
  const [transfer, setTransfer] = useState<{ transfer: TransferInfo; emailSent: boolean } | null>(null);

  // Registration form state: nombre y días de cada asistente
  const [regNumAttendees, setRegNumAttendees] = useState(1);
  const [regAttendeeNames, setRegAttendeeNames] = useState<string[]>(['']);
  const [regAttendeeDays, setRegAttendeeDays] = useState<string[][]>([[]]);
  const [regCustomData, setRegCustomData] = useState<Record<string, string>>({});
  const [regSubmitting, setRegSubmitting] = useState(false);
  // Torneos y viajes: opción de precio elegida y cupón
  const [regPriceOption, setRegPriceOption] = useState<number | null>(null);
  const [regCoupon, setRegCoupon] = useState('');
  const [couponPrice, setCouponPrice] = useState<number | null>(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [couponChecking, setCouponChecking] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const loadEvents = async () => {
    setLoading(true);
    try {
      const [fetched, taken] = await Promise.all([adapter.getEvents(), adapter.getCampusOccupancy()]);
      // Los ocultos solo los ven admins y entrenadores, para poder editarlos y reactivarlos.
      // Se guardan todos para poder redirigir un enlace a un evento del otro tipo.
      setEvents(canManage ? fetched : fetched.filter(e => e.active));
      setOccupancy(taken);
      if (user) {
        const regs = await adapter.getUserRegistrations(user.id);
        setUserRegistrations(regs);
      } else {
        setUserRegistrations([]);
      }
    } catch (e) { console.error('Failed to load campus events', e); }
    setLoading(false);
  };

  useEffect(() => { loadEvents(); }, [user]);

  // Enlace directo a un evento (p. ej. desde una noticia): /events?campus=<id> o /torneos?evento=<id>
  const searchParams = new URLSearchParams(location.search);
  const linkedCampusId = searchParams.get('campus') || searchParams.get('evento');
  useEffect(() => {
    if (!linkedCampusId || loading) return;
    const ev = events.find(e => e.id === linkedCampusId);
    if (!ev) return;
    if (ev.type !== kind) { navigate(eventPath(ev), { replace: true }); return; }
    if (expandedId !== ev.id) handleExpand(ev);
    document.getElementById(`campus-${ev.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Ya abierto: se quita del enlace para que cerrarlo no lo vuelva a abrir
    navigate(location.pathname, { replace: true });
  }, [linkedCampusId, loading, events, kind]);

  const visibleEvents = events.filter(e => e.type === kind);

  const handleSaveEvent = async (eventData: Omit<Event, 'id'>) => {
    if (editEvent) await adapter.updateEvent(editEvent.id, eventData);
    else await adapter.createEvent(eventData);
    loadEvents();
  };

  const handleDelete = (id: string) => {
    setConfirmPrompt({
      open: true,
      message: `¿Seguro que quieres borrar este ${page.noun} permanentemente?`,
      action: async () => {
        try { await adapter.deleteEvent(id); loadEvents(); }
        catch (e: any) { showMessage('Error', e.message); }
      }
    });
  };

  const handleExpand = (ev: Event) => {
    if (expandedId === ev.id) { setExpandedId(null); return; }
    setExpandedId(ev.id);
    // Reset registration form
    setRegNumAttendees(1);
    setRegAttendeeNames(['']);
    setRegAttendeeDays([[]]);
    setRegCustomData({});
    setRegPriceOption(null);
    setRegCoupon(''); setCouponPrice(null); setCouponMessage('');
  };

  const handleApplyCoupon = async (ev: Event) => {
    if (!regCoupon.trim()) return;
    setCouponChecking(true); setCouponMessage('');
    try {
      setCouponPrice(await payments.checkCoupon(ev.id, regCoupon));
    } catch (e: any) {
      setCouponPrice(null);
      setCouponMessage(e.message);
    }
    setCouponChecking(false);
  };

  const toggleDay = (attendee: number, day: string) => {
    setRegAttendeeDays(prev => prev.map((days, i) => i !== attendee ? days
      : days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort()));
  };

  const setAllDays = (attendee: number, days: string[]) => {
    setRegAttendeeDays(prev => prev.map((d, i) => i === attendee ? [...days] : d));
  };

  // Al añadir un asistente se le ponen los días del primero, que suele ser lo normal entre hermanos
  const changeAttendees = (n: number) => {
    setRegNumAttendees(n);
    setRegAttendeeNames(prev => Array.from({ length: n }, (_, i) => prev[i] || ''));
    setRegAttendeeDays(prev => Array.from({ length: n }, (_, i) => prev[i] || [...(prev[0] || [])]));
  };

  /** Ver otra vez cómo pagar una inscripción pendiente de transferencia. */
  const showTransfer = async (reference: string, amount: number) => {
    try {
      const settings = await payments.getSettings();
      setTransfer({ transfer: { ...settings, reference, amount }, emailSent: false });
    } catch (e: any) { showMessage('Error', e.message); }
  };

  const handleRegister = async (ev: Event) => {
    if (!user) { showMessage('Atención', 'Debes iniciar sesión para inscribirte.'); return; }
    const options = eventOptions(ev);
    const numAttendees = options ? 1 : regNumAttendees;
    const names = regAttendeeNames.slice(0, numAttendees).map(n => n.trim());
    if (names.some(n => !n)) {
      showMessage('Faltan datos', options ? 'Escribe el nombre del jugador.' : `Introduce el nombre de los ${numAttendees} asistentes.`);
      return;
    }
    // Si el evento se paga completo no se eligen días: se va a todos
    const attendeeDays = names.map((_, i) => choosesDays(ev) ? (regAttendeeDays[i] || []).filter(d => ev.dates.includes(d)) : ev.dates);
    const missing = attendeeDays.findIndex(days => days.length === 0);
    if (missing >= 0) { showMessage('Faltan datos', `Elige al menos un día para ${names[missing]}.`); return; }
    if (options && options.length > 1 && regPriceOption === null) {
      showMessage('Faltan datos', 'Elige una de las opciones de precio.');
      return;
    }

    // Validate required custom fields
    if (ev.custom_fields) {
      for (const cf of ev.custom_fields) {
        if (cf.required && !regCustomData[cf.name]) {
          showMessage('Faltan datos', `El campo "${cf.name}" es obligatorio.`);
          return;
        }
      }
    }

    if (!(await ensureContact())) return;
    setRegSubmitting(true);
    try {
      // El servidor vuelve a validar todo y calcula el importe; si es gratis confirma sin pago
      const result = await payments.registerForEvent({
        eventId: ev.id,
        attendeeDays,
        numAttendees,
        attendeeNames: names,
        customData: regCustomData,
        ...(options ? { priceOption: regPriceOption ?? 0, coupon: regCoupon.trim() || undefined } : {}),
      });
      setExpandedId(null);
      if (result.free) showMessage('Inscripción confirmada', '¡Listo! Tu inscripción está confirmada.');
      else setTransfer(result);
      loadEvents();
    } catch (e: any) {
      showMessage('Error', e.message);
    }
    setRegSubmitting(false);
  };

  const SkeletonList = () => (
    <>
      {[1, 2, 3].map(i => (
        <div key={i} className="skeleton-card-event">
          <div className="skeleton-event-image skeleton-shimmer" />
          <div className="skeleton-event-info">
            <div className="skeleton-title skeleton-shimmer" />
            <div className="skeleton-meta skeleton-shimmer" />
            <div className="skeleton-meta skeleton-shimmer" style={{ width: '40%' }} />
          </div>
        </div>
      ))}
    </>
  );

  return (
    <>
      <div className="events-container">
        <div className="events-header">
          <h1 className="animated-title">{page.title}</h1>
          <AdminGuard roles={['admin', 'coach']}>
            <button className="btn-admin-add" onClick={() => { setEditEvent(null); setModalOpen(true); }}>{page.create}</button>
          </AdminGuard>
        </div>

        <div className="events-list">
          {loading ? (
            <SkeletonList />
          ) : visibleEvents.length === 0 ? (
            <p className="no-items">{page.empty}</p>
          ) : (
            visibleEvents.map(ev => {
              const isExpanded = expandedId === ev.id;
              const options = eventOptions(ev);
              const myRegs = userRegistrations.filter(r => r.event_id === ev.id);
              // Estado para la etiqueta: el mejor de mis inscripciones (en campus solo hay una)
              const regStatus = myRegs.some(r => r.status === 'completed') ? 'completed'
                : myRegs.some(r => r.status === 'pending') ? 'pending'
                : myRegs.length > 0 ? 'cancelled' : undefined;
              // Una inscripción cancelada (pago no completado) no bloquea: se puede volver a rellenar.
              // En torneos y viajes se puede inscribir a otro jugador aunque ya haya alguno.
              const isRegistered = !options && regStatus !== undefined && regStatus !== 'cancelled';
              const myPlayers = options ? myRegs.filter(r => r.status !== 'cancelled') : [];
              const spotsLeft = ev.max_capacity ? Math.max(0, ev.max_capacity - (occupancy[ev.id] || 0)) : null;
              const isFull = spotsLeft === 0;
              // Con tabla de precios, como mucho un asistente por fila
              const maxAttendees = Math.min(MAX_ATTENDEES, spotsLeft ?? MAX_ATTENDEES, maxTableAttendees(ev) ?? MAX_ATTENDEES);
              const isFree = isFreeEvent(ev);
              const table = eventTable(ev);
              const pickDays = choosesDays(ev);
              const fromPrice = startingPrice(ev);
              // Días de cada asistente (con evento completo, todos); el precio sale cuando todos tienen alguno
              const regDays = Array.from({ length: regNumAttendees }, (_, i) =>
                pickDays ? (regAttendeeDays[i] || []).filter(d => ev.dates.includes(d)) : ev.dates);
              const daysReady = regDays.every(days => days.length > 0);
              const tiers = isExpanded && daysReady && regNumAttendees <= maxAttendees ? registrationTiers(ev, regDays.map(d => d.length)) : [];
              const myPending = myRegs.find(r => r.status === 'pending' && r.stripe_session_id?.startsWith('UROS-'));
              const dateRange = ev.dates.length > 0
                ? `${formatDateRanges(ev.dates, { weekday: false })} ${ev.dates[ev.dates.length - 1].slice(0, 4)}`
                : new Date(ev.date).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
              // Torneos: precio de la opción elegida (o la única), o el del cupón si se ha aplicado
              const chosenOption = options ? (options.length === 1 ? options[0] : regPriceOption !== null ? options[regPriceOption] : null) : null;
              const torneoPrice = couponPrice ?? chosenOption?.price ?? null;

              const renderBadge = () => {
                if (regStatus === 'completed') return <div className="source-badge" style={{ background: '#10b981' }} title="Tu participación está asegurada">✅ Inscrito</div>;
                if (regStatus === 'pending') return <div className="source-badge" style={{ background: '#f59e0b', color: '#000' }} title="Esperando a que el club reciba la transferencia">⏳ Pendiente de pago</div>;
                if (regStatus === 'cancelled') return <div className="source-badge" style={{ background: '#ef4444' }} title="Esta inscripción se canceló. Puedes volver a inscribirte.">❌ Cancelado</div>;
                return null;
              };

              return (
                <div key={ev.id} id={`campus-${ev.id}`} className={`event-card animate-fade-in ${isExpanded ? 'event-expanded' : ''} ${ev.active ? '' : 'event-hidden'}`}>
                  <AdminGuard roles={['admin', 'coach']}>
                    <div className="admin-card-actions">
                      <button className="btn-admin-edit" onClick={() => { setEditEvent(ev); setModalOpen(true); }} title="Editar">✏️</button>
                      {options && user?.role === 'admin' && (
                        <button className="btn-admin-edit" onClick={() => setCouponsEvent(ev)} title="Cupones de descuento">🎟️</button>
                      )}
                      <button className="btn-admin-delete" onClick={() => handleDelete(ev.id)} title="Borrar">X</button>
                    </div>
                  </AdminGuard>

                  <div className="event-card-clickable" onClick={() => handleExpand(ev)} style={{ cursor: 'pointer' }}>
                    <div className="event-image" style={campusBackground(ev.imageUrl)}>
                      <div className={`event-type-badge badge-${kind}`}>{page.badge}</div>
                      {!ev.active && <div className="event-hidden-badge" title="Los usuarios no lo ven. Edítalo y marca «Visible para los usuarios» para mostrarlo.">Oculto</div>}
                      {renderBadge()}
                    </div>
                    <div className="event-info">
                      <h3>{ev.title}</h3>
                      <div className="event-meta">
                        <span>📅 {dateRange}</span>
                        <span>📍 {ev.location}</span>
                        {ev.schedule && <span>🕐 {ev.schedule}</span>}
                        {!isFree && (
                          <span className="event-price-tag">
                            💰 {options
                              ? (options.length > 1 ? `Desde ${euros(fromPrice)}` : euros(fromPrice))
                              : table ? (table.byDays ? `Desde ${euros(fromPrice)}` : euros(fromPrice)) : `Desde ${euros(fromPrice)}/día`}
                          </span>
                        )}
                        {spotsLeft !== null && (
                          <span className={`event-spots ${isFull ? 'full' : ''}`}>
                            👥 {isFull ? 'Completo' : `Quedan ${spotsLeft} ${spotsLeft === 1 ? 'plaza' : 'plazas'}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded: Registration Form */}
                  {isExpanded && (
                    <div className="event-detail animate-slide-down">
                      <div className="detail-content">
                        {/* Removed duplicate hero img */}
                        {ev.description && (
                          <div className="detail-body">
                            {ev.description.split('\n').map((line, i) => (
                              line.trim() ? <p key={i}>{line}</p> : null
                            ))}
                          </div>
                        )}

                        {isRegistered ? (
                          <div className="campus-registered-box">
                            {regStatus === 'completed' && <p>✅ Tu inscripción está <b>Completada</b>.</p>}
                            {regStatus === 'pending' && (
                              <p>⏳ Tu inscripción está <b>pendiente</b> hasta que el club reciba la transferencia.
                                {myPending && <> <button type="button" className="btn-inline-link" onClick={() => showTransfer(myPending.stripe_session_id!, myPending.amount)}>Ver cómo pagar</button></>}
                              </p>
                            )}
                          </div>
                        ) : !user ? (
                          <div className="campus-login-box">
                            <p>🔒 Inicia sesión para inscribirte en este {page.noun}.</p>
                            <Link to={`/login?next=${encodeURIComponent(eventPath(ev))}`} className="btn-pay-local">
                              Iniciar sesión
                            </Link>
                          </div>
                        ) : isFull ? (
                          <div className="campus-full-box">
                            <p>Este {page.noun} está completo.</p>
                          </div>
                        ) : (
                          <div className="campus-registration-form">
                            <h4 className="form-header">📋 {myPlayers.length > 0 ? 'Inscribir a otro jugador' : 'Inscripción'}</h4>
                            {!options && regStatus === 'cancelled' && (
                              <p className="form-retry-note">Tu inscripción anterior se canceló. Puedes volver a inscribirte.</p>
                            )}
                            {myPlayers.length > 0 && (
                              <div className="campus-registered-box">
                                {myPlayers.map(r => (
                                  <p key={r.id}>
                                    {r.status === 'completed' ? '✅' : '⏳'} <b>{r.attendee_names.join(', ')}</b>
                                    {r.status === 'completed' ? ' ya está inscrito.' : ' está pendiente de la transferencia.'}
                                    {r.status === 'pending' && r.stripe_session_id?.startsWith('UROS-') && (
                                      <> <button type="button" className="btn-inline-link" onClick={() => showTransfer(r.stripe_session_id!, r.amount)}>Ver cómo pagar</button></>
                                    )}
                                  </p>
                                ))}
                              </div>
                            )}

                            {options && (
                              <div className="form-section">
                                <label className="form-label">{options.length > 1 ? 'Elige una opción:' : 'Precio:'}</label>
                                {options.length > 1 ? (
                                  <div className="price-options">
                                    {options.map((o, i) => (
                                      <button key={i} type="button" onClick={() => setRegPriceOption(i)}
                                        className={`price-option ${regPriceOption === i ? 'active' : ''}`}>
                                        <span>{o.label}</span>
                                        <strong>{o.price === 0 ? 'Gratis' : euros(o.price)}</strong>
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="full-event-dates">{options[0].price === 0 ? 'Gratis' : `${euros(options[0].price)} por jugador`}{options[0].label ? ` (${options[0].label})` : ''}</p>
                                )}
                              </div>
                            )}

                            {table && (
                              <div className="form-section">
                                <label className="form-label">Precios:</label>
                                <PriceTableView table={table} numDates={ev.dates.length} />
                              </div>
                            )}

                            {!pickDays && (
                              <div className="form-section">
                                <label className="form-label">Fechas:</label>
                                <p className="full-event-dates">{formatDateRanges(ev.dates)}</p>
                              </div>
                            )}

                            {/* Number of attendees (en torneos y viajes, un jugador por inscripción) */}
                            {!options && (
                            <div className="form-section">
                              <label className="form-label">Nº de asistentes:</label>
                              <div className="attendee-counter">
                                <button type="button" onClick={() => changeAttendees(Math.max(1, regNumAttendees - 1))}
                                  className="btn-counter">−</button>
                                <span className="counter-value">{regNumAttendees}</span>
                                <button type="button" onClick={() => { if (regNumAttendees < maxAttendees) changeAttendees(regNumAttendees + 1); }}
                                  className="btn-counter">+</button>
                              </div>
                            </div>
                            )}

                            {/* Nombre de cada asistente y, si se eligen días, los suyos */}
                            {options ? (
                              <div className="form-section">
                                <label className="form-label">Nombre del jugador/a:</label>
                                <input value={regAttendeeNames[0] || ''} placeholder="Nombre y apellidos" maxLength={100}
                                  onChange={e => setRegAttendeeNames([e.target.value])} className="form-text-input" />
                              </div>
                            ) : Array.from({ length: regNumAttendees }).map((_, i) => (
                              <div key={i} className={`form-section ${pickDays ? 'attendee-block' : ''}`}>
                                <label className="form-label">{regNumAttendees > 1 ? `Asistente ${i + 1}:` : 'Nombre:'}</label>
                                <input value={regAttendeeNames[i] || ''} placeholder="Nombre y apellidos" maxLength={100}
                                  onChange={e => { const u = [...regAttendeeNames]; u[i] = e.target.value; setRegAttendeeNames(u); }}
                                  className="form-text-input" />
                                {pickDays && (
                                  <>
                                    <span className="field-label-sub">Días a los que va:</span>
                                    <div className="days-picker-grid">
                                      {ev.dates.map(d => (
                                        <button key={d} type="button" onClick={() => toggleDay(i, d)}
                                          className={`day-chip ${regDays[i].includes(d) ? 'active' : ''}`}>
                                          {new Date(d + 'T00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                                        </button>
                                      ))}
                                    </div>
                                    <button type="button" onClick={() => setAllDays(i, regDays[i].length === ev.dates.length ? [] : ev.dates)}
                                      className="btn-toggle-all">
                                      {regDays[i].length === ev.dates.length ? 'Quitar todos' : 'Todos los días'}
                                    </button>
                                  </>
                                )}
                              </div>
                            ))}

                            {/* Custom fields */}
                            {ev.custom_fields && ev.custom_fields.length > 0 && (
                              <div className="form-section">
                                <label className="form-label">Datos adicionales:</label>
                                {ev.custom_fields.map((cf: CustomField) => (
                                  <div key={cf.name} className="custom-field-group">
                                    <label className="field-label-sub">
                                      {cf.name} {cf.required && '*'}
                                    </label>
                                    {cf.type === 'categorical' && cf.options ? (
                                      <select value={regCustomData[cf.name] || ''} onChange={e => setRegCustomData(prev => ({ ...prev, [cf.name]: e.target.value }))}
                                        className="form-select-input">
                                        <option value="">Selecciona...</option>
                                        {cf.options.map(o => <option key={o} value={o}>{o}</option>)}
                                      </select>
                                    ) : (
                                      <input value={regCustomData[cf.name] || ''} onChange={e => setRegCustomData(prev => ({ ...prev, [cf.name]: e.target.value }))}
                                        className="form-text-input" />
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Cupón de descuento (torneos y viajes): fija el precio final */}
                            {options && !isFree && (
                              <div className="form-section">
                                <label className="form-label">¿Tienes un cupón?</label>
                                <div className="coupon-row">
                                  <input value={regCoupon} maxLength={24} placeholder="Código" className="form-text-input"
                                    onChange={e => { setRegCoupon(e.target.value.toUpperCase()); setCouponPrice(null); setCouponMessage(''); }}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCoupon(ev); } }} />
                                  <button type="button" className="btn-toggle-all" onClick={() => handleApplyCoupon(ev)} disabled={!regCoupon.trim() || couponChecking}>
                                    {couponChecking ? 'Comprobando…' : 'Aplicar'}
                                  </button>
                                </div>
                                {couponPrice !== null && <p className="coupon-ok">✅ Cupón válido: pagarás {couponPrice === 0 ? 'nada (gratis)' : euros(couponPrice)}.</p>}
                                {couponMessage && <p className="coupon-error">{couponMessage}</p>}
                              </div>
                            )}

                            {/* Precio: el definitivo lo calcula el servidor con la misma fórmula */}
                            {options ? (
                              torneoPrice !== null ? (
                                <div className="price-breakdown-box">
                                  <div className="price-row">
                                    <span>1 jugador{chosenOption?.label ? ` · ${chosenOption.label}` : ''}{couponPrice !== null ? ' · con cupón' : ''}</span>
                                  </div>
                                  <div className="price-row final-price-row">
                                    <span>Total</span>
                                    <span>{torneoPrice === 0 ? 'Gratis' : euros(torneoPrice)}</span>
                                  </div>
                                </div>
                              ) : (
                                <p className="price-hint">Elige una opción para ver el precio.</p>
                              )
                            ) : tiers.length > 0 ? (
                              <div className="price-breakdown-box">
                                {!isFree && tiers.length > 1 ? tiers.map((t, i) => (
                                  <div key={i} className="price-row">
                                    <span>
                                      {t.attendees} {t.attendees === 1 ? 'asistente' : 'asistentes'} · {i > 0 ? `${t.days} ${t.days === 1 ? 'día' : 'días'} más` : `${t.days} ${t.days === 1 ? 'día' : 'días'}`}
                                    </span>
                                    <span>{euros(t.price)}</span>
                                  </div>
                                )) : (
                                  <div className="price-row">
                                    <span>
                                      {regNumAttendees} {regNumAttendees === 1 ? 'asistente' : 'asistentes'}
                                      {' · '}
                                      {pickDays ? `${regDays[0].length} ${regDays[0].length === 1 ? 'día' : 'días'}` : 'evento completo'}
                                    </span>
                                  </div>
                                )}
                                <div className="price-row final-price-row">
                                  <span>Total</span>
                                  <span>{isFree ? 'Gratis' : euros(registrationPrice(ev, regDays.map(d => d.length)))}</span>
                                </div>
                              </div>
                            ) : (
                              <p className="price-hint">
                                {regNumAttendees > 1 ? 'Elige los días de cada asistente para ver el precio.' : isFree ? 'Elige los días a los que vas a ir.' : 'Elige los días para ver el precio.'}
                              </p>
                            )}

                            {/* Botón desactivado hasta elegir días */}
                            <div className="form-actions-stack">
                              {/* Con un cupón escrito sin aplicar, el servidor lo comprueba igual al pagar */}
                              <button onClick={() => handleRegister(ev)}
                                disabled={regSubmitting || !daysReady || (!!options && chosenOption === null)}
                                className={isFree || torneoPrice === 0 ? 'btn-pay-local' : 'btn-pay-online'}>
                                {regSubmitting ? 'Procesando...' : isFree || torneoPrice === 0 ? '✅ Inscribirse (Gratis)' : 'Inscribirse y pagar por transferencia'}
                              </button>
                              {!isFree && torneoPrice !== 0 && (
                                <p className="price-hint">Al inscribirte te damos los datos de la cuenta del club (también por email). Tu plaza queda guardada hasta que llegue la transferencia.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {couponsEvent && <CouponsModal event={couponsEvent} onClose={() => setCouponsEvent(null)} />}
      {modalOpen && <EventModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSaveEvent}
        initial={editEvent} defaultType={kind} otherEvents={events.filter(e => e.id !== editEvent?.id)} />}
      <TransferModal result={transfer} onClose={() => setTransfer(null)} what="inscripción" />
      <MessageModal isOpen={messageAlert.open} onClose={() => setMessageAlert(prev => ({ ...prev, open: false }))} title={messageAlert.title} message={messageAlert.message} />
      <ConfirmModal isOpen={confirmPrompt.open} title="Confirmar Acción" message={confirmPrompt.message}
        onConfirm={() => { if (confirmPrompt.action) confirmPrompt.action(); setConfirmPrompt(prev => ({ ...prev, open: false, action: null })); }}
        onCancel={() => setConfirmPrompt(prev => ({ ...prev, open: false, action: null }))} />
    </>
  );
}
