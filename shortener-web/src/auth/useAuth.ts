import { createContext, useContext } from 'react';
import type { ApiResult, AuthResponse } from '../api/types';

// Тип значения контекста живёт здесь, а не в `AuthProvider.tsx`: гарды (Task 13) импортируют
// `useAuth`, и если бы контекст объявлялся в провайдере, тест гарда тянул бы провайдер целиком
// вместе с `useNavigate` и роутером.
export type AuthValue = {
  token: string | null;
  signIn: (email: string, password: string) => Promise<ApiResult<AuthResponse>>;
  signUp: (email: string, password: string) => Promise<ApiResult<AuthResponse>>;
  signOut: () => void;
  handleUnauthorized: () => void;
};

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth вне AuthProvider');
  return value;
}
