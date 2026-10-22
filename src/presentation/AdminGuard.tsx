import { ReactNode } from 'react';
import { useStore } from './store';
import type { Role } from '../domain/roles';

interface AdminGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  roles?: Role[];
}

export function AdminGuard({ children, fallback = null, roles = ['admin'] }: AdminGuardProps) {
  const { user } = useStore();

  if (!user || !roles.includes(user.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
