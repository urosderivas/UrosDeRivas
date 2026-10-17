import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Pencil, Trash2 } from 'lucide-react';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { Event, NewsPost } from '../domain/entities';
import { resolveImageUrl } from '../utils/media';
import { useStore } from './store';
import { AdminGuard } from './AdminGuard';
import { NewsModal } from './NewsModal';
import { RichText } from './components/RichText';
import { ConfirmModal } from './components/ConfirmModal';
import { MessageModal } from './components/MessageModal';
import './Home.css';
import './Content.css';

const adapter = new SupabaseAdapter();

export function Home() {
  const { user } = useStore();
  const isAdmin = user?.role === 'admin';
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

  useEffect(() => { loadNews(); }, []);

  // El admin necesita la lista de campus para poder enlazar una noticia a uno
  useEffect(() => {
    if (isAdmin) adapter.getEvents().then(setEvents).catch(console.error);
  }, [isAdmin]);

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
      <section className="hero-section">
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <h2 className="hero-title">CLUB DEPORTIVO ELEMENTAL UROS DE RIVAS</h2>
          <p className="hero-subtitle">Únete a la familia Uros de Rivas. El mejor baloncesto local.</p>
          <div className="hero-buttons">
            <Link to="/events" className="btn-primary">Ir a Campus</Link>
            <Link to="/market" className="btn-secondary">
              <ShoppingCart size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              Tienda Oficial
            </Link>
          </div>
        </div>
        <div className="scroll-indicator">
          <i className="fas fa-chevron-down"></i>
          <span>↓</span>
        </div>
      </section>

      <section className="news-section">
        <div className="news-header">
          <h3>NOTICIAS</h3>
          <AdminGuard>
            <div className="content-toolbar">
              <button className="content-admin-add" onClick={() => { setEditPost(null); setModalOpen(true); }}>+ Nueva noticia</button>
            </div>
          </AdminGuard>
        </div>

        <div className="news-grid">
          {!newsLoading && news.length === 0 && <p className="content-empty">Pronto publicaremos novedades del club.</p>}
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
                  <Link to={`/events?campus=${post.eventId}`} className="news-campus-link">Ver campus →</Link>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="news-footer">
          <Link to="/sponsors" className="btn-secondary">Nuestros patrocinadores</Link>
        </div>
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
