import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil, Trash2, ArrowRight, CalendarDays, ShoppingBag, Handshake, Trophy } from 'lucide-react';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { Event, NewsPost } from '../domain/entities';
import { clubLogoUrl, resolveImageUrl } from '../utils/media';
import { CLUB } from '../config';
import { eventPath } from '../utils/eventLinks';
import { useStore } from './store';
import { AdminGuard } from './AdminGuard';
import { NewsModal } from './NewsModal';
import { RichText } from './components/RichText';
import { ConfirmModal } from './components/ConfirmModal';
import { NewsCarousel } from './components/NewsCarousel';
import { MessageModal } from './components/MessageModal';
import { HeroSlider, HeroSlide } from './components/HeroSlider';
import { ProductCard } from './components/ProductCard';
import './Market.css';
import './Home.css';
import './Content.css';

const adapter = new SupabaseAdapter();

const TILES = [
  { to: '/events', label: 'Campus', text: 'Inscríbete en los campus del club', Icon: CalendarDays },
  { to: '/torneos', label: 'Torneos y viajes', text: 'Torneos y salidas de fin de semana', Icon: Trophy },
  { to: '/market', label: 'Tienda', text: 'Equipaciones y merchandising', Icon: ShoppingBag },
  { to: '/sponsors', label: 'Patrocinadores', text: 'Quienes nos apoyan', Icon: Handshake },
];

// Texto de una noticia para el banner: sin enlaces markdown y recortado
function slideText(body: string): string {
  const plain = body.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
  return plain.length > 140 ? plain.slice(0, 137).trimEnd() + '…' : plain;
}

export function Home() {
  const { items, fetchItems } = useStore();
  const navigate = useNavigate();
  const [news, setNews] = useState<NewsPost[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPost, setEditPost] = useState<NewsPost | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NewsPost | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const loadNews = async () => {
    try {
      setNews(await adapter.getNews());
    } catch (e) {
      console.error('Failed to load news', e);
    }
    setNewsLoading(false);
  };

  useEffect(() => { loadNews(); fetchItems(); }, [fetchItems]);

  // Para enlazar cada noticia con su campus, torneo o viaje (y para el formulario del admin)
  useEffect(() => {
    adapter.getEvents().then(setEvents).catch(console.error);
  }, []);

  const linkedEvent = (post: NewsPost) => {
    if (!post.eventId) return null;
    const ev = events.find(e => e.id === post.eventId);
    // Mientras cargan los eventos se enlaza como campus; la página redirige si es un torneo
    return {
      to: ev ? eventPath(ev) : `/events?campus=${post.eventId}`,
      label: ev?.type === 'torneo' ? 'Ver evento' : 'Ver campus',
    };
  };

  // Portada fija del club y, detrás, las noticias más recientes que tienen foto
  const slides: HeroSlide[] = [
    {
      key: 'club',
      logo: clubLogoUrl,
      kicker: 'Baloncesto en Rivas-Vaciamadrid',
      title: CLUB.shortName,
      text: 'Únete a la familia Uros de Rivas. El mejor baloncesto local.',
      buttons: [
        { label: 'Ir a Campus', to: '/events', primary: true },
        { label: 'Tienda oficial', to: '/market' },
      ],
    },
    ...news.filter(post => post.imageUrl).slice(0, 3).map(post => ({
      key: post.id,
      image: resolveImageUrl(post.imageUrl!),
      kicker: new Date(post.publishedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }),
      title: post.title,
      text: slideText(post.body),
      buttons: post.eventId ? [{ label: linkedEvent(post)!.label, to: linkedEvent(post)!.to, primary: true }] : [],
    })),
  ];

  const handleSave = async (data: Omit<NewsPost, 'id'>) => {
    await adapter.saveNews(data, editPost?.id);
    await loadNews();
  };

  const handleDelete = async (post: NewsPost) => {
    try {
      await adapter.deleteNews(post.id);
      await loadNews();
    } catch (e: any) {
      setErrorMessage(e.message);
    }
  };

  return (
    <div className="home-container">
      <HeroSlider slides={slides} />

      <section className="home-tiles">
        {TILES.map(({ to, label, text, Icon }) => (
          <Link key={to} to={to} className="home-tile">
            <Icon size={26} />
            <span className="home-tile-label">{label}</span>
            <span className="home-tile-text">{text}</span>
          </Link>
        ))}
      </section>

      {items.length > 0 && (
        <section className="home-shop">
          <div className="home-section-head">
            <h3>Tienda oficial</h3>
            <Link to="/market" className="home-see-all">Ver toda la tienda <ArrowRight size={16} /></Link>
          </div>
          <div className="home-shop-row">
            {items.slice(0, 4).map(item => (
              <ProductCard key={item.id} item={item} onOpen={() => navigate(`/market?producto=${item.id}`)} />
            ))}
          </div>
        </section>
      )}

      <section className="news-section">
        <div className="news-header">
          <h3>Noticias</h3>
          <AdminGuard>
            <div className="content-toolbar">
              <button className="content-admin-add" onClick={() => { setEditPost(null); setModalOpen(true); }}>+ Nueva noticia</button>
            </div>
          </AdminGuard>
        </div>

        {!newsLoading && news.length === 0 && <p className="content-empty">Pronto publicaremos novedades del club.</p>}
        <NewsCarousel count={news.length}>
          {news.map(post => (
            <article key={post.id} className="news-card animate-fade-in">
              <AdminGuard>
                <div className="content-card-actions">
                  <button className="edit" title="Editar" onClick={() => { setEditPost(post); setModalOpen(true); }}><Pencil size={15} /></button>
                  <button className="delete" title="Borrar" onClick={() => setConfirmDelete(post)}><Trash2 size={15} /></button>
                </div>
              </AdminGuard>
              {post.imageUrl && <img className="news-image" src={resolveImageUrl(post.imageUrl)} alt="" onError={e => e.currentTarget.style.display = 'none'} />}
              <div className="news-content">
                <time className="news-date">{new Date(post.publishedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
                <h4 className="news-title">{post.title}</h4>
                <RichText text={post.body} className="news-body" />
                {post.eventId && (
                  <Link to={linkedEvent(post)!.to} className="news-campus-link">{linkedEvent(post)!.label} →</Link>
                )}
              </div>
            </article>
          ))}
        </NewsCarousel>

      </section>

      <NewsModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} initial={editPost} events={events} />
      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Confirmar Acción"
        message={`¿Seguro que quieres borrar la noticia "${confirmDelete?.title}"?`}
        onConfirm={() => { if (confirmDelete) handleDelete(confirmDelete); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />
      <MessageModal isOpen={!!errorMessage} onClose={() => setErrorMessage('')} title="Error" message={errorMessage} />
    </div>
  );
}
