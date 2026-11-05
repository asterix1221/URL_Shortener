import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../api/auth';
import type { ApiResult, AuthResponse } from '../api/types';
import { clearToken, loadToken, saveToken } from '../lib/session';
import { EXPIRED_REDIRECT } from './sessionExpired';
import { AuthContext, type AuthValue } from './useAuth';

// Сеанс живёт в sessionStorage, а не в localStorage: на сервере нет ни refresh-эндпоинта, ни
// отзыва токена (`AuthController` даёт только register/login), TTL 3600 с, поэтому «истёк»
// приходит как 401 из любого вызова и обрабатывается одним слоем — здесь. Закрытие вкладки
// само по себе заканчивает сеанс, и токен не переживает её, чтобы не лежать в общем хранилище.
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  // navigate мемоизирован по pathname (react-router 7), поэтому он в ref, а не в deps: иначе
  // гард 401 менял бы ссылку на каждом переходе, сбрасывал useMemo значения контекста и
  // перерисовывал всех потребителей, а страница с ним в deps useEffect перезапускала бы загрузку
  // сразу после выброса на вход (тест «сохраняет ссылку после навигации»).
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  // Инициализатор `useState` (не значение): токен читается один раз на монтировании, а не на
  // каждом рендере, и тест пишет его через `saveToken` до рендера.
  const [token, setToken] = useState<string | null>(loadToken);

  const signIn = useCallback(async (email: string, password: string): Promise<ApiResult<AuthResponse>> => {
    const outcome = await login(email, password);
    if (outcome.ok) {
      saveToken(outcome.data.accessToken);
      setToken(outcome.data.accessToken);
    }
    return outcome;
  }, []);

  // Регистрация — два запроса: `POST /api/auth/register` отвечает 201 без тела, токена там нет,
  // поэтому сразу `POST /api/auth/login`. Первая неудача останавливает вторую: 409 на занятую
  // почту — это ошибка поля формы, а не севшая сессия.
  const signUp = useCallback(async (email: string, password: string): Promise<ApiResult<AuthResponse>> => {
    const registered = await register(email, password);
    if (!registered.ok) return registered;
    return signIn(email, password);
  }, [signIn]);

  const signOut = useCallback(() => {
    clearToken();
    setToken(null);
  }, []);

  // Единая точка выхода по 401: слой api уже вернул ошибку, страница вызывает этот гард только
  // при `error.status === 401` и больше ничего не решает — адрес с флагом видит и `LoginPage`, и
  // e2e задачи 15. `status: 0`, 500 и 429 к истёкшему сеансу не относятся: токен остаётся,
  // страница показывает свою ошибку (контракт `AuthValue.handleUnauthorized`).
  const handleUnauthorized = useCallback(() => {
    clearToken();
    setToken(null);
    navigateRef.current(EXPIRED_REDIRECT, { replace: true });
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ token, signIn, signUp, signOut, handleUnauthorized }),
    [token, signIn, signUp, signOut, handleUnauthorized]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
