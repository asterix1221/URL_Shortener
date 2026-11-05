import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
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
// Гард завязан на 401, а не на любой !ok: провайдер — паттерн, который копируют задачи 10–13.
// Статус пишется при любом отказе, иначе негативный тест не отличил бы 500 от успешного ответа.
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
          setLastStatus(outcome.ok ? 'ok' : String(outcome.error.status));
          if (!outcome.ok && outcome.error.status === 401) handleUnauthorized();
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
    // mockImplementation, а не mockResolvedValue: Response одноразовый, второй запрос в
    // скопированном тесте получил бы «body already used», а client.ts свёл бы это к status 0.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('{"status":401}', { status: 401 }))
    );
    renderWithProviders(<RefreshProbe />, '/links');

    await userEvent.click(screen.getByRole('button', { name: 'refresh' }));

    // waitFor + точное сравнение (форма из RequireAuth.test.tsx): findByTestId ждёт появления
    // элемента, а «loc» на /links уже есть — проверка зависела бы от того, успел ли act user-event
    // сбросить навигацию, а не от самого адреса.
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/login?expired=1'));
    expect(screen.getByTestId('token')).toHaveTextContent('none');
    expect(screen.getByTestId('status')).toHaveTextContent('401');
    expect(loadToken()).toBeNull();
  });

  it('500 и status 0 сеанс не трогают: токен цел, навигации нет', async () => {
    // Тот же путь, что у 401-пробы: провайдер выбрасывает сеанс только по 401. 500/429 — сервер
    // жив, «status: 0» (client.ts: fetch бросил сеть или аборт по таймауту) — временный сбой;
    // гард на любом !ok стёр бы токен и увёл на /login?expired=1, и задачи 10–13 скопировали бы
    // именно этот паттерн — тест держит границу.
    saveToken('KEEP');
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => Promise.resolve(new Response('{"status":500,"message":"boom"}', { status: 500 })))
      .mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    renderWithProviders(<RefreshProbe />, '/links');
    const button = screen.getByRole('button', { name: 'refresh' });

    await userEvent.click(button);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('500'));

    await userEvent.click(button);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('0'));

    expect(loadToken()).toBe('KEEP');
    expect(screen.getByTestId('token')).toHaveTextContent('KEEP');
    expect(screen.getByTestId('loc').textContent).toBe('/links');
  });

  it('signIn при 401 не сохраняет токен — ни в хранилище, ни в состояние', async () => {
    // Единственный тест, который проваливает `login`: в дампе веток проверенного прогона у signIn
    // был один вход ([1] — только успешный путь) и ни одной записи на ветке `if (outcome.ok)`,
    // поэтому «токен только по успеху» не проверялось ничем.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('{"status":401,"message":"bad credentials"}', { status: 401 }))
    );
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProviderWrapper });
    let outcome: ApiResult<AuthResponse> | undefined;

    await act(async () => {
      outcome = await result.current.signIn('a@b.co', 'wrong-password');
    });

    expect(outcome).toMatchObject({ ok: false, error: { status: 401 } });
    expect(loadToken()).toBeNull();
    expect(result.current.token).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('{"status":409,"message":"email already registered: a@b.co"}', { status: 409 }))
    );
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

  it('handleUnauthorized сохраняет ссылку после навигации, а не пересоздаётся', async () => {
    // useNavigate отдаёт колбэк, мемоизированный по pathname, поэтому `navigate` в deps
    // useCallback меняет ссылку гарда на каждом переходе: значение useMemo в контексте
    // пересобирается, все потребители перерисовываются, а страница 10–13 с гардом в deps useEffect
    // перезапускает загрузку сразу после выброса на /login.
    saveToken('STALE');
    const { result } = renderHook(
      () => {
        const { handleUnauthorized } = useAuth();
        const { pathname, search } = useLocation();
        return { unauthorized: handleUnauthorized, at: `${pathname}${search}` };
      },
      { wrapper: AuthProviderWrapper }
    );
    const first = result.current.unauthorized;

    await act(async () => {
      result.current.unauthorized();
    });

    expect(result.current.at).toBe('/login?expired=1');
    expect(loadToken()).toBeNull();
    expect(result.current.unauthorized).toBe(first);
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

  it('AuthProviderWrapper принимает path: renderHook стартует не с корня', () => {
    // У задачи 12 будет renderHook-тест, которому нужен /links/CODE, а не '/': без optional path
    // ей пришлось бы дублировать стек провайдеров вместо обёртки над готовым харнессом.
    const { result } = renderHook(() => useLocation().pathname, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProviderWrapper path="/links/AB12CD">{children}</AuthProviderWrapper>
      )
    });

    expect(result.current).toBe('/links/AB12CD');
  });

  it('useAuth вне AuthProvider падает, а не отдаёт пустой токен', () => {
    expect(() => render(<BareConsumer />)).toThrow('useAuth вне AuthProvider');
  });
});
