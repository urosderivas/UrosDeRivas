import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { Sponsor } from '../domain/entities';
import { resolveImageUrl } from '../utils/media';
import { useStore } from './store';
import { AdminGuard } from './AdminGuard';
import { SponsorModal } from './SponsorModal';
import { ConfirmModal } from './components/ConfirmModal';
import { MessageModal } from './components/MessageModal';
import './Sponsors.css';
import './Content.css';

const adapter = new SupabaseAdapter();

export function Sponsors() {
  const { user } = useStore();
  const isAdmin = user?.role === 'admin';
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editSponsor, setEditSponsor] = useState<Sponsor | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Sponsor | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const loadSponsors = async () => {
    try {
      setSponsors(await adapter.getSponsors());
    } catch (e) {
      console.error('Failed to load sponsors', e);
    }
    setLoading(false);
  };

  useEffect(() => { loadSponsors(); }, []);

  const visible = isAdmin ? sponsors : sponsors.filter(s => s.active);
  const nextSortOrder = sponsors.reduce((max, s) => Math.max(max, s.sortOrder), 0) + 1;

  const handleSave = async (data: Omit<Sponsor, 'id'>) => {
    await adapter.saveSponsor(data, editSponsor?.id);
    await loadSponsors();
  };

  const handleDelete = async (sponsor: Sponsor) => {
    try {
      await adapter.deleteSponsor(sponsor.id);
      await loadSponsors();
    } catch (e: any) {
      setErrorMessage(e.message);
    }
  };

  return (
    <section className="sponsors-section">
      <div className="sponsors-header">
        <h3>PATROCINADORES y COLABORADORES</h3>
        <p className="sponsors-subtitle">Estamos muy agradecidos a todos los Patrocinadores y Colaboradores, pues sin ellos no seríamos lo que somos y los que somos. ¡Esperamos seguir creciendo!</p>
        <AdminGuard>
          <div className="content-toolbar">
            <button className="content-admin-add" onClick={() => { setEditSponsor(null); setModalOpen(true); }}>+ Añadir patrocinador</button>
          </div>
        </AdminGuard>
      </div>

      <div className="sponsors-container">
        {!loading && visible.length === 0 && <p className="content-empty">Todavía no hay patrocinadores.</p>}
        <div className="sponsors-grid">
          {visible.map(s => (
            <div key={s.id} className={`sponsor-card ${s.active ? '' : 'sponsor-hidden'}`}>
              <a
                href={s.linkUrl || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="sponsor-item"
              >
                <img src={resolveImageUrl(s.imageUrl)} alt={s.name} onError={e => e.currentTarget.style.display = 'none'} />
              </a>
              {!s.active && <span className="sponsor-hidden-badge">Oculto</span>}
              <AdminGuard>
                <div className="content-card-actions">
                  <button className="edit" title="Editar" onClick={() => { setEditSponsor(s); setModalOpen(true); }}><Pencil size={15} /></button>
                  <button className="delete" title="Borrar" onClick={() => setConfirmDelete(s)}><Trash2 size={15} /></button>
                </div>
              </AdminGuard>
            </div>
          ))}
        </div>
      </div>

      <SponsorModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} initial={editSponsor} nextSortOrder={nextSortOrder} />
      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Confirmar Acción"
        message={`¿Seguro que quieres borrar a ${confirmDelete?.name}?`}
        onConfirm={() => { if (confirmDelete) handleDelete(confirmDelete); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />
      <MessageModal isOpen={!!errorMessage} onClose={() => setErrorMessage('')} title="Error" message={errorMessage} />
    </section>
  );
}
