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
  // Предусловие: звонить только по 401. Остальные `!ok` — не истёкший сеанс: `client.ts` отдаёт
  // `status: 0` на сетевом сбое и аборте и пропускает 500/429 как есть, а гард по любому исходу
  // стёр бы токен и увёл с формы — иначе `errors.credentials`-путь задачи 10 тонет в выбросе на
  // /login?expired=1 вместо сообщения в поле. Проба в AuthProvider.test.tsx держит границу.
  handleUnauthorized: () => void;
};

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth вне AuthProvider');
  return value;
}
