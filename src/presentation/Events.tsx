import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from './store';
import { AdminGuard } from './AdminGuard';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { StripeAdapter } from '../infrastructure/StripeAdapter';
import { EventModal } from './EventModal';
import { Event, CustomField } from '../domain/entities';
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

// Price calculation helper
function calcCampusPrice(
  event: Event,
  numDays: number,
  numAttendees: number
): { pricePerDay: number; subtotal: number; discount: number; total: number } {
  // Find best tier
  let pricePerDay = event.price_per_day;
  const sortedTiers = [...(event.price_tiers || [])].sort((a, b) => b.minDays - a.minDays);
  for (const tier of sortedTiers) {
    if (numDays >= tier.minDays) { pricePerDay = tier.pricePerDay; break; }
  }

  const subtotal = pricePerDay * numDays * numAttendees;

  // Find best attendee discount
  let discountPct = 0;
  const sortedDiscounts = [...(event.attendee_discounts || [])].sort((a, b) => b.minAttendees - a.minAttendees);
  for (const d of sortedDiscounts) {
    if (numAttendees >= d.minAttendees) { discountPct = d.discountPct; break; }
  }

  const discount = subtotal * (discountPct / 100);
  const total = subtotal - discount;

  return { pricePerDay, subtotal, discount, total };
}

export function Events() {
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

  const loadEvents = async () => {
    setLoading(true);
    try {
      const [fetched, taken] = await Promise.all([adapter.getEvents(), adapter.getCampusOccupancy()]);
      // Los campus ocultos solo los ven admins y entrenadores, para poder editarlos y reactivarlos
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
    if (params.get('success')) {
      showMessage('Pago Completado', '¡Inscripción pagada con éxito! Has recibido tu reserva segura.');
    } else if (params.get('canceled')) {
      stripeAdapter.cancelPendingCheckout().finally(() => {
        loadEvents();
        showMessage('Pago Cancelado', 'El pago ha sido cancelado o abandonado.');
      });
    }
  }, [user, location.search]);

  // Enlace directo a un campus (p. ej. desde una noticia): /events?campus=<id>
  const linkedCampusId = new URLSearchParams(location.search).get('campus');
  useEffect(() => {
    if (!linkedCampusId || loading) return;
    const ev = events.find(e => e.id === linkedCampusId);
    if (!ev) return;
    if (expandedId !== ev.id) handleExpand(ev);
    document.getElementById(`campus-${ev.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [linkedCampusId, loading, events]);

  const handleSaveEvent = async (eventData: Omit<Event, 'id'>) => {
    if (editEvent) await adapter.updateEvent(editEvent.id, eventData);
    else await adapter.createEvent(eventData);
    loadEvents();
  };

  const handleDelete = (id: string) => {
    setConfirmPrompt({
      open: true,
      message: '¿Seguro que quieres borrar este campus permanentemente?',
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

  const handleRegister = async (ev: Event, payLocal: boolean) => {
    if (!user) { showMessage('Atención', 'Debes iniciar sesión para inscribirte.'); return; }
    if (regSelectedDays.length === 0) { showMessage('Faltan datos', 'Selecciona al menos un día.'); return; }

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

    const pricing = calcCampusPrice(ev, regSelectedDays.length, regNumAttendees);

    setRegSubmitting(true);
    try {
      if (!payLocal) {
        // Stripe flow
        const url = await stripeAdapter.createCampusCheckoutSession({
          eventId: ev.id,
          title: ev.title,
          selectedDays: regSelectedDays,
          numAttendees: regNumAttendees,
          attendeeNames: names,
          amount: pricing.total,
          customData: regCustomData
        }, user.email || '');
        window.location.href = url;
        return;
      }

      const reservedAmount = await stripeAdapter.reserveCampusPayLocal({
        eventId: ev.id,
        selectedDays: regSelectedDays,
        numAttendees: regNumAttendees,
        attendeeNames: names,
        customData: regCustomData
      });
      setUserRegistrations(prev => ({ ...prev, [ev.id]: 'pending' }));
      showMessage('Reserva Confirmada', `✅ Inscripción reservada por €${reservedAmount.toFixed(2)}. Paga en el campus.`);
      setExpandedId(null);
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
          <h1 className="animated-title">Campus</h1>
          <AdminGuard roles={['admin', 'coach']}>
            <button className="btn-admin-add" onClick={() => { setEditEvent(null); setModalOpen(true); }}>+ Crear Campus</button>
          </AdminGuard>
        </div>

        <div className="events-list">
          {loading ? (
            <SkeletonList />
          ) : events.length === 0 ? (
            <p className="no-items">No hay campus disponibles actualmente.</p>
          ) : (
            events.map(ev => {
              const isExpanded = expandedId === ev.id;
              const regStatus = userRegistrations[ev.id];
              const isRegistered = regStatus !== undefined;
              const spotsLeft = ev.max_capacity ? Math.max(0, ev.max_capacity - (occupancy[ev.id] || 0)) : null;
              const isFull = spotsLeft === 0;
              const maxAttendees = spotsLeft === null ? MAX_ATTENDEES : Math.min(MAX_ATTENDEES, spotsLeft);
              const isFree = ev.price_per_day === 0 && (ev.price_tiers || []).every(t => t.pricePerDay === 0);
              const dateRange = ev.dates.length > 0
                ? `${new Date(ev.dates[0] + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - ${new Date(ev.dates[ev.dates.length - 1] + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : new Date(ev.date).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

              const renderBadge = () => {
                if (regStatus === 'completed') return <div className="source-badge" style={{ background: '#10b981' }} title="Tu participación está asegurada">✅ Inscrito</div>;
                if (regStatus === 'pending') return <div className="source-badge" style={{ background: '#f59e0b', color: '#000' }} title="Los administradores están revisando tu inscripción">⏳ Pendiente</div>;
                if (regStatus === 'cancelled') return <div className="source-badge" style={{ background: '#ef4444' }} title="Pago fallido o cancelado. Espera revisión del club.">❌ Cancelado</div>;
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
                      <div className="event-type-badge badge-campus">CAMPUS</div>
                      {!ev.active && <div className="event-hidden-badge" title="Los usuarios no lo ven. Edítalo y marca «Campus activo» para mostrarlo.">Oculto</div>}
                      {renderBadge()}
                    </div>
                    <div className="event-info">
                      <h3>{ev.title}</h3>
                      <div className="event-meta">
                        <span>📅 {dateRange}</span>
                        <span>📍 {ev.location}</span>
                        {ev.schedule && <span>🕐 {ev.schedule}</span>}
                        {ev.price_per_day > 0 && (
                          <span className="event-price-tag">💰 Desde {ev.price_per_day.toFixed(2)}€/día</span>
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
                            {regStatus === 'pending' && <p>⏳ Tu inscripción está <b>Pendiente</b> de revisión por los administradores o de finalizar el pago online.</p>}
                            {regStatus === 'cancelled' && <p>❌ Tu inscripción ha sido <b>Cancelada</b>. Espera a que un administrador la elimine para volver a intentar rellenarla.</p>}
                          </div>
                        ) : !user ? (
                          <div className="campus-login-box">
                            <p>🔒 Inicia sesión para inscribirte en este campus.</p>
                            <Link to={`/login?next=${encodeURIComponent(`/events?campus=${ev.id}`)}`} className="btn-pay-local">
                              Iniciar sesión
                            </Link>
                          </div>
                        ) : isFull ? (
                          <div className="campus-full-box">
                            <p>Este campus está completo.</p>
                          </div>
                        ) : (
                          <div className="campus-registration-form">
                            <h4 className="form-header">📋 Inscripción</h4>

                            {/* Day picker */}
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

                             {/* Price calculation */}
                             {(() => {
                               const p = calcCampusPrice(ev, regSelectedDays.length, regNumAttendees);
                               return (
                                 <>
                                   {regSelectedDays.length > 0 && (
                                     <div className="price-breakdown-box">
                                       <div className="price-row">
                                         <span>{regSelectedDays.length} días × {regNumAttendees} asist. × {p.pricePerDay.toFixed(2)}€/día</span>
                                         <span>{p.subtotal.toFixed(2)}€</span>
                                       </div>
                                       {p.discount > 0 && (
                                         <div className="price-row discount-row">
                                           <span>Descuento</span>
                                           <span>-{p.discount.toFixed(2)}€</span>
                                         </div>
                                       )}
                                       <div className="price-row final-price-row">
                                         <span>Total</span>
                                         <span>{p.total.toFixed(2)}€</span>
                                       </div>
                                     </div>
                                   )}
 
                                   {regSelectedDays.length === 0 && (
                                     <p className="price-hint">
                                       {isFree ? 'Elige los días a los que vas a ir.' : 'Elige los días para ver el precio.'}
                                     </p>
                                   )}

                                   {/* Action buttons: desactivados hasta elegir días */}
                                   <div className="form-actions-stack">
                                     {!isFree && (
                                       <button onClick={() => handleRegister(ev, false)} disabled={regSubmitting || regSelectedDays.length === 0}
                                         className="btn-pay-online">
                                         {regSubmitting ? 'Procesando...' : '💳 Pagar Online con Stripe'}
                                       </button>
                                     )}
                                     <button onClick={() => handleRegister(ev, true)} disabled={regSubmitting || regSelectedDays.length === 0}
                                       className="btn-pay-local">
                                       {regSubmitting ? 'Procesando...' : isFree ? '✅ Inscribirse (Gratis)' : '🏪 Reservar y Pagar en Campus'}
                                     </button>
                                   </div>
                                 </>
                               );
                             })()}
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

      {modalOpen && <EventModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSaveEvent} initial={editEvent} />}
      <MessageModal isOpen={messageAlert.open} onClose={() => setMessageAlert(prev => ({ ...prev, open: false }))} title={messageAlert.title} message={messageAlert.message} />
      <ConfirmModal isOpen={confirmPrompt.open} title="Confirmar Acción" message={confirmPrompt.message}
        onConfirm={() => { if (confirmPrompt.action) confirmPrompt.action(); setConfirmPrompt(prev => ({ ...prev, open: false, action: null })); }}
        onCancel={() => setConfirmPrompt(prev => ({ ...prev, open: false, action: null }))} />
    </>
  );
}
