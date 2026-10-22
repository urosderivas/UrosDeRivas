/** Roles de la web. Los asigna un admin desde el panel (pestaña Usuarios). */
export type Role = 'admin' | 'coach' | 'tienda' | 'fisio' | 'user';

export const ROLES: Role[] = ['user', 'coach', 'tienda', 'fisio', 'admin'];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  coach: 'Entrenador',
  tienda: 'Tienda',
  fisio: 'Fisio',
  user: 'Usuario',
};

/** Roles que entran en el panel de ADMIN (cada uno ve solo sus pestañas). */
export const STAFF_ROLES: Role[] = ['admin', 'coach', 'tienda', 'fisio'];

export const isStaff = (role?: Role | null) => !!role && STAFF_ROLES.includes(role);
