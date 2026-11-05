import { screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { saveToken } from '../lib/session';
import { renderWithProviders } from '../test/render';
import { RedirectIfAuthed, RequireAuth } from './RequireAuth';

function LocationMarker() {
  const { pathname, search } = useLocation();
  return <span data-testid="loc">{`${pathname}${search}`}</span>;
}

// Адрес читается через useLocation, а не моком useNavigate: контракт гарда — настоящий путь в
// памяти роутера (тот же контракт проверяет e2e задачи 15), и мока роутера хватает, чтобы
// <Routes> перестали быть маршрутами.
describe('RequireAuth', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('без токена уводит на /login и детей не рендерит', async () => {
    renderWithProviders(
      <>
        <RequireAuth><span data-testid="secret">x</span></RequireAuth>
        <LocationMarker />
      </>,
      '/links'
    );

    // сравнение точное: toHaveTextContent ищет подстроку, а «/» есть в любом адресе
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/login'));
    expect(screen.queryByTestId('secret')).not.toBeInTheDocument();
  });

  it('с токеном оставляет на месте и рендерит детей', () => {
    saveToken('T');
    renderWithProviders(
      <>
        <RequireAuth><span data-testid="secret">x</span></RequireAuth>
        <LocationMarker />
      </>,
      '/links'
    );

    expect(screen.getByTestId('secret')).toBeInTheDocument();
    expect(screen.getByTestId('loc').textContent).toBe('/links');
  });
});

describe('RedirectIfAuthed', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('с токеном уводит с /login на список', async () => {
    saveToken('T');
    renderWithProviders(
      <>
        <RedirectIfAuthed><span data-testid="login">x</span></RedirectIfAuthed>
        <LocationMarker />
      </>,
      '/login'
    );

    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/'));
    expect(screen.queryByTestId('login')).not.toBeInTheDocument();
  });

  it('без токена оставляет на входе и рендерит детей', () => {
    renderWithProviders(
      <>
        <RedirectIfAuthed><span data-testid="login">x</span></RedirectIfAuthed>
        <LocationMarker />
      </>,
      '/login'
    );

    expect(screen.getByTestId('login')).toBeInTheDocument();
    expect(screen.getByTestId('loc').textContent).toBe('/login');
  });
});
