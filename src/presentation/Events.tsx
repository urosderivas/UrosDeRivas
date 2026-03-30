import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from './store';
import { AdminGuard } from './AdminGuard';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { StripeAdapter } from '../infrastructure/StripeAdapter';
import { EventModal } from './EventModal';
import { Event, CustomField } from '../domain/entities';
import { MessageModal } from './components/MessageModal';
import { ConfirmModal } from './components/ConfirmModal';
import './Events.css';

const adapter = new SupabaseAdapter();
const stripeAdapter = new StripeAdapter();

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

  const subtotalDiscount = subtotal * (discountPct / 100);
  const total = subtotal - subtotalDiscount;

  return { pricePerDay, subtotal, discount: subtotalDiscount, total };
}

export function Events() {
  const { user } = useStore();
  const [events, setEvents] = useState<Event[]>([]);
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
      const fetched = await adapter.getEvents();
      setEvents(fetched.filter(e => e.active));
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
      const sessionId = params.get('session_id');
      if (sessionId && user) {
        adapter.checkStripePayment(sessionId).then(res => {
          if (res.payment_status === 'paid') {
            loadEvents();
          }
        }).catch(() => { });
      }
    } else if (params.get('canceled')) {
      showMessage('Pago Cancelado', 'El pago ha sido cancelado o abandonado.');
    }
  }, [user, location.search]);

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

    const names = regAttendeeNames.filter(n => n.trim());
    if (names.length < regNumAttendees) {
      showMessage('Faltan datos', `Introduce el nombre de los ${regNumAttendees} asistentes.`);
      return;
    }

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

      await adapter.createCampusRegistration({
        eventId: ev.id,
        selectedDays: regSelectedDays,
        numAttendees: regNumAttendees,
        attendeeNames: names,
        amount: pricing.total,
        customData: regCustomData,
        status: 'pending',
      });
      setUserRegistrations(prev => ({ ...prev, [ev.id]: 'pending' }));
      showMessage('Reserva Confirmada', `✅ Inscripción reservada por €${pricing.total.toFixed(2)}. Paga en el campus.`);
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
              const dateRange = ev.dates.length > 0
                ? `${new Date(ev.dates[0] + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - ${new Date(ev.dates[ev.dates.length - 1] + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : new Date(ev.date).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

              const renderBadge = () => {
                if (regStatus === 'completed') return <div className="source-badge" style={{ background: '#10b981' }}>✅ Inscrito</div>;
                if (regStatus === 'pending') return <div className="source-badge" style={{ background: '#f59e0b', color: '#000' }}>⏳ Pendiente</div>;
                if (regStatus === 'cancelled') return <div className="source-badge" style={{ background: '#ef4444' }}>❌ Cancelado</div>;
                return null;
              };

              return (
                <div key={ev.id} className={`event-card animate-fade-in ${isExpanded ? 'event-expanded' : ''}`}>
                  <AdminGuard roles={['admin', 'coach']}>
                    <div className="admin-card-actions">
                      <button className="btn-admin-edit" onClick={() => { setEditEvent(ev); setModalOpen(true); }} title="Editar">✏️</button>
                      <button className="btn-admin-delete" onClick={() => handleDelete(ev.id)} title="Borrar">X</button>
                    </div>
                  </AdminGuard>

                  <div className="event-card-clickable" onClick={() => handleExpand(ev)} style={{ cursor: 'pointer' }}>
                    {ev.imageUrl ? (
                      <div className="event-image" style={{ backgroundImage: `url(${ev.imageUrl})` }}>
                        <div className="event-type-badge badge-campus">CAMPUS</div>
                        {renderBadge()}
                      </div>
                    ) : (
                      <div className="event-image event-image-placeholder">
                        <div className="event-type-badge badge-campus">CAMPUS</div>
                        {renderBadge()}
                        <span className="placeholder-icon">🏀</span>
                      </div>
                    )}
                    <div className="event-info">
                      <h3>{ev.title}</h3>
                      <div className="event-meta">
                        <span>📅 {dateRange}</span>
                        <span>📍 {ev.location}</span>
                        {ev.schedule && <span>🕐 {ev.schedule}</span>}
                        {ev.price_per_day > 0 && (
                          <span className="event-price-tag">💰 Desde {ev.price_per_day.toFixed(2)}€/día</span>
                        )}
                      </div>
                    </div>
                  </div>

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
                        ) : (
                          <div className="campus-registration-form">
                            <h4 className="form-header">📋 Inscripción</h4>

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

                            <div className="form-section">
                              <label className="form-label">Nº de asistentes:</label>
                              <div className="attendee-counter">
                                <button type="button" onClick={() => { const n = Math.max(1, regNumAttendees - 1); setRegNumAttendees(n); setRegAttendeeNames(prev => prev.slice(0, n)); }}
                                  className="btn-counter">−</button>
                                <span className="counter-value">{regNumAttendees}</span>
                                <button type="button" onClick={() => { const n = regNumAttendees + 1; setRegNumAttendees(n); setRegAttendeeNames(prev => [...prev, '']); }}
                                  className="btn-counter">+</button>
                              </div>
                            </div>

                            <div className="form-section">
                              <label className="form-label">Nombre(s):</label>
                              {Array.from({ length: regNumAttendees }).map((_, i) => (
                                <input key={i} value={regAttendeeNames[i] || ''} placeholder={`Asistente ${i + 1}`}
                                  onChange={e => { const u = [...regAttendeeNames]; u[i] = e.target.value; setRegAttendeeNames(u); }}
                                  className="form-text-input" />
                              ))}
                            </div>

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
 
                                   <div className="form-actions-stack">
                                     {p.total > 0 && (
                                       <button onClick={() => handleRegister(ev, false)} disabled={regSubmitting}
                                         className="btn-pay-online">
                                         {regSubmitting ? 'Procesando...' : '💳 Pagar Online con Stripe'}
                                       </button>
                                     )}
                                     <button onClick={() => handleRegister(ev, true)} disabled={regSubmitting}
                                       className="btn-pay-local">
                                       {regSubmitting ? 'Procesando...' : p.total === 0 ? '✅ Inscribirse (Gratis)' : '🏪 Reservar y Pagar en Campus'}
                                     </button>
                                   </div>
                                 </>
                               );
                             })()}
 
                             {!user && (
                               <p className="login-prompt">🔒 Inicia sesión para inscribirte.</p>
                             )}
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
