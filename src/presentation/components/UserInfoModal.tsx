import { Info, Phone, Mail } from 'lucide-react';
import type { UserProfile } from '../../domain/entities';
import { ROLE_LABELS, Role } from '../../domain/roles';
import { telHref } from '../../utils/profile';
import { Modal } from './Modal';
import '../Account.css';

interface Props {
  user: { id: string; email: string; role: string; created_at: string } | null;
  profile?: UserProfile;
  onClose: () => void;
}

/** Ficha de un usuario en el panel: lo que ha puesto en "Mi cuenta". */
export function UserInfoModal({ user, profile, onClose }: Props) {
  if (!user) return null;
  const empty = <span className="user-info-empty">Sin rellenar</span>;

  return (
    <Modal isOpen onClose={onClose} title="Datos del usuario" icon={<Info size={22} />} maxWidth="480px">
      <dl className="user-info">
        <dt>Email</dt>
        <dd><a href={`mailto:${user.email}`}><Mail size={14} /> {user.email}</a></dd>
        <dt>Nombre</dt>
        <dd>{profile?.first_name || empty}</dd>
        <dt>Apellidos</dt>
        <dd>{profile?.last_name || empty}</dd>
        <dt>Teléfono</dt>
        <dd>{profile?.phone ? <a href={telHref(profile.phone)}><Phone size={14} /> {profile.phone}</a> : empty}</dd>
        <dt>Rol</dt>
        <dd>{ROLE_LABELS[user.role as Role] || user.role}</dd>
        <dt>Registro</dt>
        <dd>{new Date(user.created_at).toLocaleDateString('es-ES')}</dd>
      </dl>
    </Modal>
  );
}
