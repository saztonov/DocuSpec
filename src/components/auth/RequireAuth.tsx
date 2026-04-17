import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from '../../hooks/useAuth';

interface Props {
  children: ReactNode;
  requireAdmin?: boolean;
}

export default function RequireAuth({ children, requireAdmin = false }: Props) {
  const { session, profile, loading, profileLoading } = useAuth();
  const location = useLocation();

  // Пока грузится стартовая сессия — или сессия есть, но профиль ещё в процессе загрузки/ретраев —
  // показываем спиннер, но НЕ редиректим. Это защищает от разлогина при hard-reload.
  if (loading || (session && profileLoading)) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (!profile) {
    // Сессия валидна, но профиль не удалось загрузить после ретраев. Тост уже показан в useAuth.
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="Не удалось загрузить профиль. Обновите страницу." />
      </div>
    );
  }

  if (requireAdmin && profile.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
