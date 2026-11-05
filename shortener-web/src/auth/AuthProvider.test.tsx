import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listLinks } from '../api/links';
import type { ApiResult, AuthResponse } from '../api/types';
import { loadToken, saveToken } from '../lib/session';
import { AuthProviderWrapper, renderWithProviders } from '../test/render';
import { useAuth } from './useAuth';

function LocationMarker() {
  const { pathname, search } = useLocation();
  return <span data-testid="loc">{`${pathname}${search}`}</span>;
}

// Проба идёт путём страницы: запрос делает слой api, а handleUnauthorized зовётся только по его
// исходу — иначе тест проверял бы ручной вызов гарда, а не то, как 401 до него добирается.
function RefreshProbe() {
  const { token, handleUnauthorized } = useAuth();
  const [lastStatus, setLastStatus] = useState('idle');
  return (
    <>
      <span data-testid="token">{token ?? 'none'}</span>
      <span data-testid="status">{lastStatus}</span>
      <button
        onClick={async () => {
          const outcome = await listLinks(0, 20, token ?? '');
          if (!outcome.ok) {
            setLastStatus(String(outcome.error.status));
            handleUnauthorized();
          }
        }}
      >
        refresh
      </button>
      <Routes>
        <Route path="/links" element={<LocationMarker />} />
        <Route path="/login" element={<LocationMarker />} />
      </Routes>
    </>
  );
}

// `useAuth` вне провайдера обязан падать, а не отдавать `token: null` — иначе гард молча
// считал бы анонима вошедшим. Голый `render` допустим: потребитель не трогает i18n.
function BareConsumer() {
  const { token } = useAuth();
  return <span>{token ?? 'none'}</span>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    // токен читается при монтировании провайдера, поэтому хранилище чистится ДО рендера
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('401 из слоя API сбрасывает токен и ведёт на вход с флагом в URL', async () => {
    saveToken('STALE');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"status":401}', { status: 401 }));
    renderWithProviders(<RefreshProbe />, '/links');

    await userEvent.click(screen.getByRole('button', { name: 'refresh' }));

    expect(await screen.findByTestId('loc')).toHaveTextContent('/login?expired=1');
    expect(screen.getByTestId('token')).toHaveTextContent('none');
    expect(screen.getByTestId('status')).toHaveTextContent('401');
    expect(loadToken()).toBeNull();
  });

  it('signUp делает два запроса подряд и берёт токен из второго', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response('{"accessToken":"NEW","expiresIn":3600}', { status: 200 }));
    const { result } = renderHook(
      () => ({ auth: useAuth(), at: useLocation().pathname }),
      { wrapper: AuthProviderWrapper }
    );

    await act(async () => {
      await result.current.auth.signUp('a@b.co', 'Passw0rd!');
    });

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(['/api/auth/register', '/api/auth/login']);
    expect(loadToken()).toBe('NEW');
    expect(result.current.auth.token).toBe('NEW');
    // переход на список делает страница (Task 10), провайдер адрес не меняет даже при успехе
    expect(result.current.at).toBe('/');
  });

  it('409 на регистрации — второго запроса, токена и навигации нет', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"status":409,"message":"email already registered: a@b.co"}', { status: 409 }));
    const { result } = renderHook(
      () => ({ auth: useAuth(), at: useLocation().pathname }),
      { wrapper: AuthProviderWrapper }
    );
    let outcome: ApiResult<AuthResponse> | undefined;

    await act(async () => {
      outcome = await result.current.auth.signUp('a@b.co', 'Passw0rd!');
    });

    expect(outcome).toMatchObject({ ok: false, error: { status: 409 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loadToken()).toBeNull();
    expect(result.current.auth.token).toBeNull();
    expect(result.current.at).toBe('/');
  });

  it('signOut убирает токен из провайдера и из sessionStorage, адрес не меняет', async () => {
    saveToken('T');
    const { result } = renderHook(
      () => ({ auth: useAuth(), at: useLocation().pathname }),
      { wrapper: AuthProviderWrapper }
    );
    expect(result.current.auth.token).toBe('T');

    await act(async () => {
      result.current.auth.signOut();
    });

    expect(result.current.auth.token).toBeNull();
    expect(loadToken()).toBeNull();
    expect(result.current.at).toBe('/');
  });

  it('useAuth вне AuthProvider падает, а не отдаёт пустой токен', () => {
    expect(() => render(<BareConsumer />)).toThrow('useAuth вне AuthProvider');
  });
});
