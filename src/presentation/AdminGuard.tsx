import { ReactNode } from 'react';
import { useStore } from './store';

interface AdminGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  roles?: ('admin' | 'coach' | 'user')[];
}

export function AdminGuard({ children, fallback = null, roles = ['admin'] }: AdminGuardProps) {
  const { user } = useStore();

  if (!user || !roles.includes(user.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
