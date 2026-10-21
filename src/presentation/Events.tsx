import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './store';
import { AdminGuard } from './AdminGuard';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { StripeAdapter } from '../infrastructure/StripeAdapter';
import { EventModal } from './EventModal';
import { Event, CustomField, EventType } from '../domain/entities';
import { choosesDays, eventPrice, eventTable, isFreeEvent, startingPrice, PriceTable } from '../domain/pricing';
import { EVENT_PAGES, eventPath } from '../utils/eventLinks';
import { MessageModal } from './components/MessageModal';
import { ConfirmModal } from './components/ConfirmModal';
import { fallbackImageUrl, resolveImageUrl } from '../utils/media';
import './Events.css';

const adapter = new SupabaseAdapter();
const stripeAdapter = new StripeAdapter();
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
      {table.extraAttendee > 0 && (
        <p className="price-table-note">
          A partir de {rows + 1} asistentes: +{euros(table.extraAttendee)} por cada asistente más{table.byDays ? ' y día' : ''}.
        </p>
      )}
    </div>
  );
}

export function Events({ kind = 'campus' }: { kind?: EventType }) {
  const page = EVENT_PAGES[kind];
  const { user } = useStore();
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
  const [userRegistrations, setUserRegistrations] = useState<Record<string, string>>({});

  // Registration form state
  const [regSelectedDays, setRegSelectedDays] = useState<string[]>([]);
  const [regNumAttendees, setRegNumAttendees] = useState(1);
  const [regAttendeeNames, setRegAttendeeNames] = useState<string[]>(['']);
  const [regCustomData, setRegCustomData] = useState<Record<string, string>>({});
  const [regSubmitting, setRegSubmitting] = useState(false);

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
      }
    } catch (e) { console.error('Failed to load campus events', e); }
    setLoading(false);
  };

  useEffect(() => {
    loadEvents();

    // Check Stripe success / cancel redirects
    const params = new URLSearchParams(location.search);
    if (params.get('session_id') === 'free') {
      showMessage('Inscripción confirmada', '¡Listo! Tu inscripción está confirmada.');
    } else if (params.get('success')) {
      showMessage('Pago Completado', '¡Inscripción pagada con éxito! Has recibido tu reserva segura.');
    } else if (params.get('canceled')) {
      stripeAdapter.cancelPendingCheckout().finally(() => {
        loadEvents();
        showMessage('Pago Cancelado', 'El pago ha sido cancelado o abandonado.');
      });
    }
  }, [user, location.search]);

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
    setRegSelectedDays([]);
    setRegNumAttendees(1);
    setRegAttendeeNames(['']);
    setRegCustomData({});
  };

  const toggleDay = (day: string) => {
    setRegSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
  };

  const handleRegister = async (ev: Event) => {
    if (!user) { showMessage('Atención', 'Debes iniciar sesión para inscribirte.'); return; }
    // Si el evento se paga completo no se eligen días: se va a todos
    const days = choosesDays(ev) ? regSelectedDays : ev.dates;
    if (days.length === 0) { showMessage('Faltan datos', 'Selecciona al menos un día.'); return; }

    // Validate attendee names
    const names = regAttendeeNames.filter(n => n.trim());
    if (names.length < regNumAttendees) {
      showMessage('Faltan datos', `Introduce el nombre de los ${regNumAttendees} asistentes.`);
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

    setRegSubmitting(true);
    try {
      // El servidor vuelve a validar todo y calcula el importe; si es gratis confirma sin pago
      const url = await stripeAdapter.createCampusCheckoutSession({
        eventId: ev.id,
        selectedDays: days,
        numAttendees: regNumAttendees,
        attendeeNames: names,
        customData: regCustomData
      }, user.email || '');
      window.location.href = url;
      return;
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
              const regStatus = userRegistrations[ev.id];
              // Una inscripción cancelada (pago no completado) no bloquea: se puede volver a rellenar
              const isRegistered = regStatus !== undefined && regStatus !== 'cancelled';
              const spotsLeft = ev.max_capacity ? Math.max(0, ev.max_capacity - (occupancy[ev.id] || 0)) : null;
              const isFull = spotsLeft === 0;
              const maxAttendees = spotsLeft === null ? MAX_ATTENDEES : Math.min(MAX_ATTENDEES, spotsLeft);
              const isFree = isFreeEvent(ev);
              const table = eventTable(ev);
              const pickDays = choosesDays(ev);
              const fromPrice = startingPrice(ev);
              const regDays = pickDays ? regSelectedDays : ev.dates;
              const dateRange = ev.dates.length > 0
                ? `${new Date(ev.dates[0] + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - ${new Date(ev.dates[ev.dates.length - 1] + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : new Date(ev.date).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

              const renderBadge = () => {
                if (regStatus === 'completed') return <div className="source-badge" style={{ background: '#10b981' }} title="Tu participación está asegurada">✅ Inscrito</div>;
                if (regStatus === 'pending') return <div className="source-badge" style={{ background: '#f59e0b', color: '#000' }} title="Los administradores están revisando tu inscripción">⏳ Pendiente</div>;
                if (regStatus === 'cancelled') return <div className="source-badge" style={{ background: '#ef4444' }} title="El pago no se completó. Puedes volver a inscribirte.">❌ Cancelado</div>;
                return null;
              };

              return (
                <div key={ev.id} id={`campus-${ev.id}`} className={`event-card animate-fade-in ${isExpanded ? 'event-expanded' : ''} ${ev.active ? '' : 'event-hidden'}`}>
                  <AdminGuard roles={['admin', 'coach']}>
                    <div className="admin-card-actions">
                      <button className="btn-admin-edit" onClick={() => { setEditEvent(ev); setModalOpen(true); }} title="Editar">✏️</button>
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
                            💰 {table ? (table.byDays ? `Desde ${euros(fromPrice)}` : euros(fromPrice)) : `Desde ${euros(fromPrice)}/día`}
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
                            {regStatus === 'pending' && <p>⏳ Tu inscripción está <b>Pendiente</b> de pago. Si no terminaste el pago, se cancelará sola y podrás volver a inscribirte.</p>}
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
                            <h4 className="form-header">📋 Inscripción</h4>
                            {regStatus === 'cancelled' && (
                              <p className="form-retry-note">Tu inscripción anterior no se completó porque el pago se canceló. Puedes volver a inscribirte.</p>
                            )}

                            {table && (
                              <div className="form-section">
                                <label className="form-label">Precios:</label>
                                <PriceTableView table={table} numDates={ev.dates.length} />
                              </div>
                            )}

                            {/* Day picker (no hace falta si se paga el evento completo) */}
                            {pickDays ? (
                            <div className="form-section">
                              <label className="form-label">Selecciona los días:</label>
                              <div className="days-picker-grid">
                                {ev.dates.map(d => {
                                  const selected = regSelectedDays.includes(d);
                                  return (
                                    <button key={d} type="button" onClick={() => toggleDay(d)}
                                      className={`day-chip ${selected ? 'active' : ''}`}>
                                      {new Date(d + 'T00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                                    </button>
                                  );
                                })}
                              </div>
                              <button type="button" onClick={() => setRegSelectedDays(regSelectedDays.length === ev.dates.length ? [] : [...ev.dates])}
                                className="btn-toggle-all">
                                {regSelectedDays.length === ev.dates.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                              </button>
                            </div>
                            ) : (
                              <div className="form-section">
                                <label className="form-label">Fechas:</label>
                                <p className="full-event-dates">
                                  {ev.dates.map(d => new Date(d + 'T00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })).join(' · ')}
                                </p>
                              </div>
                            )}

                            {/* Number of attendees */}
                            <div className="form-section">
                              <label className="form-label">Nº de asistentes:</label>
                              <div className="attendee-counter">
                                <button type="button" onClick={() => { const n = Math.max(1, regNumAttendees - 1); setRegNumAttendees(n); setRegAttendeeNames(prev => prev.slice(0, n)); }}
                                  className="btn-counter">−</button>
                                <span className="counter-value">{regNumAttendees}</span>
                                <button type="button" onClick={() => { if (regNumAttendees >= maxAttendees) return; const n = regNumAttendees + 1; setRegNumAttendees(n); setRegAttendeeNames(prev => [...prev, '']); }}
                                  className="btn-counter">+</button>
                              </div>
                            </div>

                            {/* Attendee names */}
                            <div className="form-section">
                              <label className="form-label">Nombre(s):</label>
                              {Array.from({ length: regNumAttendees }).map((_, i) => (
                                <input key={i} value={regAttendeeNames[i] || ''} placeholder={`Asistente ${i + 1}`}
                                  onChange={e => { const u = [...regAttendeeNames]; u[i] = e.target.value; setRegAttendeeNames(u); }}
                                  className="form-text-input" />
                              ))}
                            </div>

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

                            {/* Precio: el definitivo lo calcula el servidor con la misma fórmula */}
                            {regDays.length > 0 ? (
                              <div className="price-breakdown-box">
                                <div className="price-row">
                                  <span>
                                    {regNumAttendees} {regNumAttendees === 1 ? 'asistente' : 'asistentes'}
                                    {' · '}
                                    {pickDays ? `${regDays.length} ${regDays.length === 1 ? 'día' : 'días'}` : 'evento completo'}
                                  </span>
                                </div>
                                <div className="price-row final-price-row">
                                  <span>Total</span>
                                  <span>{isFree ? 'Gratis' : euros(eventPrice(ev, regNumAttendees, regDays.length))}</span>
                                </div>
                              </div>
                            ) : (
                              <p className="price-hint">
                                {isFree ? 'Elige los días a los que vas a ir.' : 'Elige los días para ver el precio.'}
                              </p>
                            )}

                            {/* Botón desactivado hasta elegir días */}
                            <div className="form-actions-stack">
                              <button onClick={() => handleRegister(ev)} disabled={regSubmitting || regDays.length === 0}
                                className={isFree ? 'btn-pay-local' : 'btn-pay-online'}>
                                {regSubmitting ? 'Procesando...' : isFree ? '✅ Inscribirse (Gratis)' : '💳 Pagar con tarjeta'}
                              </button>
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

      {modalOpen && <EventModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSaveEvent}
        initial={editEvent} defaultType={kind} otherEvents={events.filter(e => e.id !== editEvent?.id)} />}
      <MessageModal isOpen={messageAlert.open} onClose={() => setMessageAlert(prev => ({ ...prev, open: false }))} title={messageAlert.title} message={messageAlert.message} />
      <ConfirmModal isOpen={confirmPrompt.open} title="Confirmar Acción" message={confirmPrompt.message}
        onConfirm={() => { if (confirmPrompt.action) confirmPrompt.action(); setConfirmPrompt(prev => ({ ...prev, open: false, action: null })); }}
        onCancel={() => setConfirmPrompt(prev => ({ ...prev, open: false, action: null }))} />
    </>
  );
}
