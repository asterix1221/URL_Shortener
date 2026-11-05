import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

// Адреса без `/app/`: гард живёт внутри роутера с `basename`, а `useLocation` отдаёт путь уже
// за вычетом базового префикса (рулинг 8-B), так же их пишет таблица маршрутов в App.tsx.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

// Обратный гард для /login: вошедший не должен видеть форму входа, а `<Navigate to="/">`
// попадает в список ссылок.
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  return token ? <Navigate to="/" replace /> : <>{children}</>;
}
