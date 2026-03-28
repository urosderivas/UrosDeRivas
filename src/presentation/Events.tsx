import { useEffect, useState } from 'react';
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

  const discount = subtotal * (discountPct / 100);
  const total = subtotal - discount;

  return { pricePerDay, subtotal, discount, total };
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
  const [userRegistrations, setUserRegistrations] = useState<string[]>([]);

  // Registration form state
  const [regSelectedDays, setRegSelectedDays] = useState<string[]>([]);
  const [regNumAttendees, setRegNumAttendees] = useState(1);
  const [regAttendeeNames, setRegAttendeeNames] = useState<string[]>(['']);
  const [regCustomData, setRegCustomData] = useState<Record<string, string>>({});
  const [regSubmitting, setRegSubmitting] = useState(false);

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

  useEffect(() => { loadEvents(); }, [user]);

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

      await adapter.createCampusRegistration({
        eventId: ev.id,
        selectedDays: regSelectedDays,
        numAttendees: regNumAttendees,
        attendeeNames: names,
        amount: pricing.total,
        customData: regCustomData,
        status: 'pending',
      });
      setUserRegistrations(prev => [...prev, ev.id]);
      showMessage('Reserva Confirmada', `✅ Inscripción reservada por €${pricing.total.toFixed(2)}. Paga en el campus.`);
      setExpandedId(null);
    } catch (e: any) {
      showMessage('Error', e.message);
    }
    setRegSubmitting(false);
  };

  if (loading) return <div className="loading-state">Cargando campus...</div>;

  return (
    <>
      <div className="events-container">
        <div className="events-header">
          <h1>Campus</h1>
          <AdminGuard roles={['admin', 'coach']}>
            <button className="btn-admin-add" onClick={() => { setEditEvent(null); setModalOpen(true); }}>+ Crear Campus</button>
          </AdminGuard>
        </div>

        <div className="events-list">
          {events.length === 0 ? (
            <p className="no-items">No hay campus disponibles actualmente.</p>
          ) : (
            events.map(ev => {
              const isExpanded = expandedId === ev.id;
              const isRegistered = userRegistrations.includes(ev.id);
              const dateRange = ev.dates.length > 0
                ? `${new Date(ev.dates[0] + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - ${new Date(ev.dates[ev.dates.length - 1] + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : new Date(ev.date).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

              return (
                <div key={ev.id} className={`event-card ${isExpanded ? 'event-expanded' : ''}`}>
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
                        {isRegistered && <div className="source-badge" style={{ background: '#10b981' }}>✅ Inscrito</div>}
                      </div>
                    ) : (
                      <div className="event-image event-image-placeholder">
                        <div className="event-type-badge badge-campus">CAMPUS</div>
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
                          <span style={{ color: '#d4af37', fontWeight: 700 }}>
                            💰 Desde {ev.price_per_day.toFixed(2)}€/día
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded: Registration Form */}
                  {isExpanded && (
                    <div className="event-detail animate-slide-down">
                      <div className="detail-content">
                        {ev.imageUrl && <img src={ev.imageUrl} alt={ev.title} className="detail-hero-img" />}
                        {ev.description && (
                          <div className="detail-body">
                            {ev.description.split('\n').map((line, i) => (
                              line.trim() ? <p key={i}>{line}</p> : null
                            ))}
                          </div>
                        )}

                        {isRegistered ? (
                          <div className="campus-registered-box">
                            <p>✅ Ya estás inscrito en este campus.</p>
                          </div>
                        ) : (
                          <div className="campus-registration-form">
                            <h4 style={{ color: '#d4af37', marginBottom: '16px' }}>📋 Inscripción</h4>

                            {/* Day picker */}
                            <div style={{ marginBottom: '16px' }}>
                              <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>Selecciona los días:</label>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {ev.dates.map(d => {
                                  const selected = regSelectedDays.includes(d);
                                  return (
                                    <button key={d} type="button" onClick={() => toggleDay(d)}
                                      style={{
                                        padding: '8px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
                                        border: selected ? '2px solid #d4af37' : '2px solid rgba(255,255,255,0.15)',
                                        background: selected ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.05)',
                                        color: selected ? '#d4af37' : '#aaa', cursor: 'pointer', transition: 'all 0.15s',
                                      }}>
                                      {new Date(d + 'T00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                                    </button>
                                  );
                                })}
                              </div>
                              <button type="button" onClick={() => setRegSelectedDays(regSelectedDays.length === ev.dates.length ? [] : [...ev.dates])}
                                style={{ marginTop: '6px', background: 'none', border: 'none', color: '#d4af37', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}>
                                {regSelectedDays.length === ev.dates.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                              </button>
                            </div>

                            {/* Number of attendees */}
                            <div style={{ marginBottom: '16px' }}>
                              <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>Nº de asistentes:</label>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <button type="button" onClick={() => { const n = Math.max(1, regNumAttendees - 1); setRegNumAttendees(n); setRegAttendeeNames(prev => prev.slice(0, n)); }}
                                  style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer', fontSize: '1.1rem' }}>−</button>
                                <span style={{ fontWeight: 700, fontSize: '1.2rem', minWidth: '20px', textAlign: 'center' }}>{regNumAttendees}</span>
                                <button type="button" onClick={() => { const n = regNumAttendees + 1; setRegNumAttendees(n); setRegAttendeeNames(prev => [...prev, '']); }}
                                  style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer', fontSize: '1.1rem' }}>+</button>
                              </div>
                            </div>

                            {/* Attendee names */}
                            <div style={{ marginBottom: '16px' }}>
                              <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>Nombres de los asistentes:</label>
                              {Array.from({ length: regNumAttendees }).map((_, i) => (
                                <input key={i} value={regAttendeeNames[i] || ''} placeholder={`Asistente ${i + 1}`}
                                  onChange={e => { const u = [...regAttendeeNames]; u[i] = e.target.value; setRegAttendeeNames(u); }}
                                  style={{
                                    width: '100%', padding: '8px 12px', borderRadius: '6px', marginBottom: '6px',
                                    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)',
                                    color: '#fff', fontSize: '0.9rem',
                                  }} />
                              ))}
                            </div>

                            {/* Custom fields */}
                            {ev.custom_fields && ev.custom_fields.length > 0 && (
                              <div style={{ marginBottom: '16px' }}>
                                <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>Datos adicionales:</label>
                                {ev.custom_fields.map((cf: CustomField) => (
                                  <div key={cf.name} style={{ marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '4px', display: 'block' }}>
                                      {cf.name} {cf.required && '*'}
                                    </label>
                                    {cf.type === 'categorical' && cf.options ? (
                                      <select value={regCustomData[cf.name] || ''} onChange={e => setRegCustomData(prev => ({ ...prev, [cf.name]: e.target.value }))}
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff' }}>
                                        <option value="">Selecciona...</option>
                                        {cf.options.map(o => <option key={o} value={o}>{o}</option>)}
                                      </select>
                                    ) : (
                                      <input value={regCustomData[cf.name] || ''} onChange={e => setRegCustomData(prev => ({ ...prev, [cf.name]: e.target.value }))}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '0.9rem' }} />
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
                                    <div style={{
                                      background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '10px',
                                      padding: '16px', marginBottom: '16px',
                                    }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px' }}>
                                        <span>{regSelectedDays.length} días × {regNumAttendees} asist. × {p.pricePerDay.toFixed(2)}€/día</span>
                                        <span>{p.subtotal.toFixed(2)}€</span>
                                      </div>
                                      {p.discount > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#4caf50' }}>
                                          <span>Descuento</span>
                                          <span>-{p.discount.toFixed(2)}€</span>
                                        </div>
                                      )}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(212,175,55,0.2)', color: '#d4af37' }}>
                                        <span>Total</span>
                                        <span>{p.total.toFixed(2)}€</span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Action buttons */}
                                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    {p.total > 0 && (
                                      <button onClick={() => handleRegister(ev, false)} disabled={regSubmitting}
                                        style={{
                                          flex: 1, padding: '12px', fontWeight: 700, fontSize: '0.95rem',
                                          background: '#635bff', color: '#fff', border: 'none',
                                          borderRadius: '10px', cursor: 'pointer', minWidth: '200px',
                                        }}>
                                        {regSubmitting ? 'Procesando...' : '💳 Pagar Online con Stripe'}
                                      </button>
                                    )}
                                    <button onClick={() => handleRegister(ev, true)} disabled={regSubmitting}
                                      style={{
                                        flex: 1, padding: '12px', fontWeight: 700, fontSize: '0.95rem',
                                        background: 'transparent', color: '#d4af37', border: '2px solid #d4af37',
                                        borderRadius: '10px', cursor: 'pointer', minWidth: '200px',
                                      }}>
                                      {regSubmitting ? 'Procesando...' : p.total === 0 ? '✅ Inscribirse (Gratis)' : '🏪 Reservar y Pagar en Campus'}
                                    </button>
                                  </div>
                                </>
                              );
                            })()}

                            {!user && (
                              <p style={{ color: '#888', fontSize: '0.85rem', marginTop: '10px', textAlign: 'center' }}>
                                🔒 Inicia sesión para inscribirte.
                              </p>
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
