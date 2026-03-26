import { useEffect, useState } from 'react';
import { useStore } from './store';
import { AdminGuard } from './AdminGuard';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { EventModal } from './EventModal';
import { Event } from '../domain/entities';
import './Events.css';

const adapter = new SupabaseAdapter();
const CLUB_ID = '67';

// A unified event item that can come from either Supabase or Clupik
interface UnifiedEvent {
  id: string;
  title: string;
  date: string;
  location: string;
  imageUrl?: string;
  description?: string;
  type: Event['type'] | 'publication';
  source: 'supabase' | 'clupik';
  slug?: string;          // for Clupik detail fetch
  formLinks?: string[];   // extracted form links
  htmlBody?: string;      // raw detail body
}

function extractLinks(html: string): string[] {
  const regex = /href="(https?:\/\/[^"]+)"/gi;
  const links: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    links.push(match[1]);
  }
  return links;
}

function sanitizeHtml(html: string): string {
  // 1. Decode all HTML entities using the browser parser
  const decoder = document.createElement('textarea');
  decoder.innerHTML = html;
  let decoded = decoder.value;

  // 2. Preserve safe tags: <a>, <strong>, <em>, <br>, <p>
  //    - Make all <a> open in new tab with styling
  decoded = decoded
    .replace(/<a\s+([^>]*href="[^"]*"[^>]*)>/gi, (_match, attrs) => {
      // Ensure target="_blank" and rel="noopener"
      let href = '';
      const hrefMatch = attrs.match(/href="([^"]*)"/i);
      if (hrefMatch) href = hrefMatch[1];
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="inline-link">`;
    });

  // 3. Strip all tags EXCEPT the allowed ones
  const allowedTags = ['a', 'strong', 'em', 'b', 'i', 'br', 'p', 'span'];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/gi;
  decoded = decoded.replace(tagRegex, (tag, tagName) => {
    return allowedTags.includes(tagName.toLowerCase()) ? tag : '';
  });

  // 4. Normalize whitespace in empty paragraphs
  decoded = decoded.replace(/<p>\s*<\/p>/gi, '');

  return decoded.trim();
}

export function Events() {
  const { user } = useStore();
  const [supabaseEvents, setSupabaseEvents] = useState<UnifiedEvent[]>([]);
  const [clupikPubs, setClupikPubs] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingClupik, setLoadingClupik] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, any>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<Event | null>(null);
  const [userRegistrations, setUserRegistrations] = useState<string[]>([]);

  const loadSupabaseEvents = async () => {
    setLoading(true);
    try {
      const fetchedEvents = await adapter.getEvents();
      setSupabaseEvents(fetchedEvents.map(e => ({ ...e, source: 'supabase' as const })));
      if (user) {
        const registrations = await adapter.getUserRegistrations(user.id);
        setUserRegistrations(registrations);
      }
    } catch (e) {
      console.error('Failed to fetch Supabase events or registrations:', e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Supabase events and user registrations
  useEffect(() => {
    loadSupabaseEvents();
  }, [user]); // Re-fetch if user changes

  // Fetch Clupik publications
  useEffect(() => {
    const fetchPublications = async () => {
      setLoadingClupik(true);
      try {
        const res = await fetch(
          `https://api.clupik.com/clubs/${CLUB_ID}/publications?expand=user&languageId=709&languageCode=es&limit=15`
        );
        if (!res.ok) throw new Error('Clupik publications failed');
        const data = await res.json();
        const pubs: UnifiedEvent[] = (Array.isArray(data) ? data : []).map((p: any) => {
          const rawText = p.card?.text || '';
          const match = rawText.match(/<img[^>]+src=["']?([^"'>]+)["']/i);
          const imageUrl = match ? match[1] : undefined;
          return {
            id: `clupik_${p.id}`,
            title: p.card?.title || p.slug || 'Publicación',
            date: p.date,
            location: 'Club Uros de Rivas',
            imageUrl,
            description: p.preview || '',
            type: 'publication' as const,
            source: 'clupik' as const,
            slug: p.slug,
          };
        });
        setClupikPubs(pubs);
      } catch (e) {
        console.error('Failed to fetch Clupik publications:', e);
      } finally {
        setLoadingClupik(false);
      }
    };
    fetchPublications();
  }, []);

  // Fetch detail for a Clupik publication by slug
  const fetchClupikDetail = async (slug: string, eventId: string) => {
    if (detailCache[eventId]) return; // Already cached
    setDetailLoading(true);
    try {
      const res = await fetch(
        `https://api.clupik.com/clubs/${CLUB_ID}/publications/slug/${slug}?expand=user&languageCode=ES&languageId=709&languageRelation=false`
      );
      if (!res.ok) throw new Error('Detail fetch failed');
      const data = await res.json();
      const rawHtml = data.card?.text || data.text || '';
      const links = extractLinks(rawHtml);
      const bodyHtml = sanitizeHtml(rawHtml);
      setDetailCache(prev => ({ ...prev, [eventId]: { body: bodyHtml, links } }));
    } catch (e) {
      console.error('Clupik detail fetch error:', e);
      setDetailCache(prev => ({ ...prev, [eventId]: { body: 'No se pudo cargar el detalle.', links: [] } }));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExpand = (ev: UnifiedEvent) => {
    if (expandedId === ev.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(ev.id);
    if (ev.source === 'clupik' && ev.slug) {
      fetchClupikDetail(ev.slug, ev.id);
    }
  };

  // Merge and sort all events
  const allEvents: UnifiedEvent[] = [...supabaseEvents, ...clupikPubs]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Admin handlers
  const handleSaveEvent = async (eventData: Omit<Event, 'id'>) => {
    if (editEvent) {
      await adapter.updateEvent(editEvent.id, eventData);
    } else {
      await adapter.createEvent(eventData);
    }
    loadSupabaseEvents();
  };
  const handleOpenCreate = () => { setEditEvent(null); setModalOpen(true); };
  const handleOpenEdit = (ev: Event) => { setEditEvent(ev); setModalOpen(true); };
  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Seguro que quieres borrar este evento?')) return;
    try { await adapter.deleteEvent(id); loadSupabaseEvents(); }
    catch (e: any) { alert('Error: ' + e.message); }
  };

  const handleToggleRegistration = async (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return alert('Debes iniciar sesión para apuntarte.');
    const isRegistered = userRegistrations.includes(eventId);
    try {
      await adapter.toggleEventRegistration(eventId, user.id, isRegistered);
      setUserRegistrations(prev => isRegistered ? prev.filter(id => id !== eventId) : [...prev, eventId]);
    } catch (e: any) { alert('Error interno: ' + e.message); }
  };

  const isLoading = loading && loadingClupik && allEvents.length === 0;
  if (isLoading) return <div className="loading-state">Cargando eventos...</div>;

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'match': return { label: 'PARTIDO', cls: 'badge-match' };
      case 'training': return { label: 'ENTRENAMIENTO', cls: 'badge-training' };
      case 'campus': return { label: 'CAMPUS', cls: 'badge-campus' };
      case 'publication': return { label: 'PUBLICACIÓN', cls: 'badge-publication' };
      default: return { label: type.toUpperCase(), cls: '' };
    }
  };

  return (
    <>
      <div className="events-container">
        <div className="events-header">
          <h1>Eventos y Publicaciones</h1>
          <AdminGuard roles={['admin', 'coach']}>
            <button className="btn-admin-add" onClick={handleOpenCreate}>+ Añadir Evento</button>
          </AdminGuard>
        </div>

        <div className="events-list">
          {allEvents.length === 0 ? (
            <p className="no-items">Próximamente disponible.</p>
          ) : (
            allEvents.map(ev => {
              const badge = getTypeBadge(ev.type);
              const isExpanded = expandedId === ev.id;
              const detail = detailCache[ev.id];

              return (
                <div key={ev.id} className={`event-card ${isExpanded ? 'event-expanded' : ''}`}>
                  {ev.source === 'supabase' && (
                    <AdminGuard roles={['admin', 'coach']}>
                      <div className="admin-card-actions">
                        <button className="btn-admin-edit" onClick={() => handleOpenEdit(ev as Event)} title="Editar">✏️</button>
                        <button className="btn-admin-delete" onClick={() => handleDelete(ev.id)} title="Borrar">X</button>
                      </div>
                    </AdminGuard>
                  )}

                  <div
                    className="event-card-clickable"
                    onClick={() => handleExpand(ev)}
                    style={{ cursor: 'pointer' }}
                  >
                    {ev.imageUrl ? (
                      <div className="event-image" style={{ backgroundImage: `url(${ev.imageUrl})` }}>
                        <div className={`event-type-badge ${badge.cls}`}>{badge.label}</div>
                        {ev.source === 'clupik' && <div className="source-badge">🌐 Clupik</div>}
                      </div>
                    ) : (
                      <div className="event-image event-image-placeholder">
                        <div className={`event-type-badge ${badge.cls}`}>{badge.label}</div>
                        <span className="placeholder-icon">🏀</span>
                      </div>
                    )}
                    <div className="event-info">
                      <h3>{ev.title}</h3>
                      <div className="event-meta">
                        <span>📅 {new Date(ev.date).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        <span>📍 {ev.location}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="event-detail animate-slide-down">
                      {ev.source === 'clupik' ? (
                        detailLoading && !detail ? (
                          <div className="detail-loading">Cargando detalle desde Clupik...</div>
                        ) : detail ? (
                          <div className="detail-content">
                            {ev.imageUrl && (
                              <img src={ev.imageUrl} alt={ev.title} className="detail-hero-img" />
                            )}
                            <div className="detail-body" dangerouslySetInnerHTML={{ __html: detail.body }} />
                            {detail.links.length > 0 && (
                              <div className="detail-links">
                                <h4>🔗 Enlaces relacionados</h4>
                                {detail.links.map((link: string, i: number) => (
                                  <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="detail-link">
                                    {link.includes('forms.gle') || link.includes('forms.google') ? '📝 Formulario de Inscripción' :
                                      link.includes('instagram') ? '📸 Instagram' :
                                        link.includes('twitter') || link.includes('x.com') ? '🐦 Twitter/X' :
                                          `🌐 ${new URL(link).hostname}`}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="detail-loading">Haz clic para cargar el detalle.</p>
                        )
                      ) : (
                        // Supabase event detail
                        <div className="detail-content">
                          {ev.imageUrl && <img src={ev.imageUrl} alt={ev.title} className="detail-hero-img" />}
                          {ev.description && (
                            <div className="detail-body">
                              {ev.description.split('\n').map((line, i) => (
                                line.trim() ? <p key={i}>{line}</p> : null
                              ))}
                            </div>
                          )}

                          <div className="event-registration-box" style={{ marginTop: '1.5rem', textAlign: 'center', padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            {user ? (
                              <button
                                className={`btn-primary ${userRegistrations.includes(ev.id) ? 'registered' : ''}`}
                                onClick={(e) => handleToggleRegistration(ev.id, e)}
                                style={{
                                  background: userRegistrations.includes(ev.id) ? 'rgba(56, 142, 60, 0.2)' : '',
                                  borderColor: userRegistrations.includes(ev.id) ? '#388e3c' : '',
                                  color: userRegistrations.includes(ev.id) ? '#4caf50' : ''
                                }}
                              >
                                {userRegistrations.includes(ev.id) ? '✅ Inscrito (Darse de baja)' : '🚀 Apuntarme'}
                              </button>
                            ) : (
                              <p className="login-hint" style={{ color: '#aaa', fontSize: '0.9rem', margin: 0 }}>🔒 Inicia sesión en la plataforma para poder apuntarte.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <EventModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveEvent}
        initial={editEvent}
      />
    </>
  );
}
