import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRound, ShoppingBag, Trash2 } from 'lucide-react';
import { useStore } from './store';
import { Modal } from './components/Modal';
import { ConfirmModal } from './components/ConfirmModal';
import { ContactForm } from './components/ContactForm';
import { MyOrdersList } from './MyOrders';
import './Account.css';

export type AccountTab = 'datos' | 'pedidos';

/** Mi cuenta: datos de contacto, pedidos y borrar la cuenta. */
export function AccountModal({ onClose, initialTab = 'datos' }: { onClose: () => void; initialTab?: AccountTab }) {
  const { user, profile, loadProfile, saveProfile, deleteAccount } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AccountTab>(initialTab);
  const [loadError, setLoadError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    if (user && !profile) loadProfile().catch(e => setLoadError(e.message));
  }, [user, profile, loadProfile]);

  const handleDelete = async () => {
    setDeleting(true); setDeleteError('');
    try {
      await deleteAccount();
      setDeleted(true);
      navigate('/');
    } catch (e: any) {
      setDeleteError(e.message);
    }
    setDeleting(false);
  };

  if (deleted) {
    return (
      <Modal isOpen onClose={onClose} title="Cuenta borrada" icon={<UserRound size={22} />} maxWidth="480px">
        <p className="account-intro">Tu cuenta y tus datos de contacto se han borrado. ¡Gracias por haber estado con el club!</p>
        <div className="contact-form-actions">
          <button className="btn-modal-save" onClick={onClose}>Cerrar</button>
        </div>
      </Modal>
    );
  }
  if (!user) return null;

  return (
    <Modal isOpen onClose={onClose} title="Mi cuenta" icon={<UserRound size={22} />} maxWidth="650px">
      <div className="account-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'datos'} className={tab === 'datos' ? 'active' : ''} onClick={() => setTab('datos')}>
          <UserRound size={16} /> Mis datos
        </button>
        <button role="tab" aria-selected={tab === 'pedidos'} className={tab === 'pedidos' ? 'active' : ''} onClick={() => setTab('pedidos')}>
          <ShoppingBag size={16} /> Mis pedidos
        </button>
      </div>

      {tab === 'pedidos' ? <MyOrdersList /> : (
        <>
          <p className="account-intro">
            El club usa estos datos solo para contactarte por tus pedidos, inscripciones y citas.
          </p>
          <div className="form-group">
            <label htmlFor="account-email">Email <span className="label-hint">(el de tu cuenta, no se puede cambiar)</span></label>
            <input id="account-email" value={user.email} readOnly disabled />
          </div>
          {loadError ? <p className="modal-error">No se pudieron cargar tus datos: {loadError}</p>
            : profile ? <ContactForm key={user.id} initial={profile} submitLabel="Guardar" onSubmit={saveProfile} />
            : <p className="text-secondary">Cargando tus datos...</p>}

          <div className="account-danger">
            <div>
              <h3>Borrar mi cuenta</h3>
              <p>Se borran tu cuenta y tus datos de contacto. El club guarda tus pedidos e inscripciones ya terminados para sus cuentas.</p>
            </div>
            <button className="btn-danger" onClick={() => setConfirmDelete(true)} disabled={deleting}>
              <Trash2 size={16} /> {deleting ? 'Borrando...' : 'Borrar mi cuenta'}
            </button>
            {deleteError && <p className="modal-error">{deleteError}</p>}
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={confirmDelete}
        title="¿Borrar tu cuenta?"
        message="Se borrará tu cuenta para siempre y no se puede deshacer. Si más adelante quieres comprar o inscribirte, tendrás que crear una nueva."
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </Modal>
  );
}
