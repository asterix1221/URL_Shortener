import { screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LinkResponse, Page } from './api/types';
import { saveToken } from './lib/session';
import { renderApp } from './test/render';

// Гарды и 404 проверяются на собранном `<App/>`, поэтому под `RedirectIfAuthed` попадает настоящий
// `LinksPage`, а он при монтировании спрашивает `/api/links`. Без стаби `globalThis.fetch` уходит в
// сеть, слой отдаёт `status: 0`, и список встречает тест состоянием ошибки.
const pageBody = (): Page<LinkResponse> => ({
  content: [
    {
      code: 'abc123',
      shortUrl: 'http://localhost:28080/app/abc123',
      originalUrl: 'https://example.com/very/long/path',
      createdAt: '2026-11-01T10:00:00Z',
      expiresAt: null,
      maxClicks: null,
      active: true
    }
  ],
  number: 0,
  size: 20,
  totalElements: 1,
  totalPages: 1,
  first: true,
  last: true
});

const stubLinks = (): void => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(pageBody()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  );
};

beforeEach(() => {
  sessionStorage.clear();
  stubLinks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('без токена карточка уводит на вход', () => {
  renderApp('/links/abc');
  expect(screen.getByRole('tablist')).toBeInTheDocument();
});

it('с токеном вход уводит в список', () => {
  saveToken('T');
  renderApp('/login');
  // ассерт на форме, а не на таблице: `<LinkForm/>` остаётся на странице во всех трёх состояниях
  // списка, поэтому проверка гарда не зависит от ответа мока
  expect(screen.getByRole('button', { name: /Создать$/ })).toBeInTheDocument();
});

it('без токена неизвестный путь — тоже вход', () => {
  renderApp('/kotlin');
  expect(screen.getByRole('tablist')).toBeInTheDocument();
});

it('вошедший на неизвестном пути видит 404 и возврат к списку', () => {
  saveToken('T');
  renderApp('/kotlin');
  expect(screen.getByText('Такой страницы нет')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Открыть список ссылок' })).toHaveAttribute('href', '/app/');
});
