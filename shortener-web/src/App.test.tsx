import { screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LinkResponse, LinkStats, Page } from './api/types';
import { saveToken } from './lib/session';
import { BASE, renderApp } from './test/render';

// Собранное `<App/>` под тестами 2 и 5 монтирует настоящие экраны, а они при монтировании спрашивают
// API: `LinksPage` — `/api/links?page=…`, `LinkDetailPage` — карточку и `/stats`. Без стаба запрос
// ушёл бы в сеть (`globalThis.fetch` здесь настоящий), слой вернул бы `status: 0`, и экран
// встретил бы тест состоянием ошибки. Стаб обязан разбирать url, а не отдавать одно тело всем:
// страница списка и карточка ждут разные формы, и тест 5 на одном теле для всех запросов падал бы
// не из-за сломанного гарда, а из-за несовпавшей формы ответа.
const CARD: LinkResponse = {
  code: 'abc',
  shortUrl: 'http://localhost:28080/a/abc',
  originalUrl: 'https://example.com/long',
  createdAt: '2026-11-01T10:00:00Z',
  expiresAt: null,
  maxClicks: null,
  active: true
};

const STATS: LinkStats = {
  code: 'abc',
  totalClicks: 2,
  byDay: [{ date: '2026-11-03', count: 2 }],
  topReferrers: [{ referrer: '', count: 2 }]
};

const PAGE: Page<LinkResponse> = {
  content: [CARD],
  number: 0,
  size: 20,
  totalElements: 1,
  totalPages: 1,
  first: true,
  last: true
};

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

// Ответ отдаётся функцией, а не готовым экземпляром: тело `Response` читается один раз
// (`client.ts:38`), и второй запрос к одному и тому же объекту дошёл бы до `catch`.
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/stats')) return json(STATS);
    if (url.endsWith('/links/abc')) return json(CARD);
    return json(PAGE);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('без токена карточка уводит на вход', () => {
  renderApp('/links/abc');
  expect(screen.getByRole('tablist')).toBeInTheDocument();
});

it('с токеном вход уводит в список', async () => {
  saveToken('T');
  renderApp('/login');
  // ассерт на ФОРМЕ, а не на таблице: `<LinkForm/>` остаётся на странице во всех трёх состояниях
  // списка, поэтому сам гард не зависит от ответа мока (`LinksPage.tsx:116`)
  expect(screen.getByRole('button', { name: /Создать$/ })).toBeInTheDocument();
  // а этот — ждёт готового состояния и делает стаб нагружаемым: без него строки нет, тест
  // падал бы на таймауте `findBy`, а не проходил молча
  expect(await screen.findByRole('link', { name: 'abc' })).toBeInTheDocument();
});

it('без токена неизвестный путь — тоже вход', () => {
  renderApp('/kotlin');
  expect(screen.getByRole('tablist')).toBeInTheDocument();
});

it('вошедший на неизвестном пути видит 404 и возврат к списку', () => {
  saveToken('T');
  renderApp('/kotlin');
  expect(screen.getByText('Такой страницы нет')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Открыть список ссылок' })).toHaveAttribute('href', BASE);
});

// Первый тест, который проверяет ветку `/links/:code`, а не падение в `*`: аноним на сломанном
// пути уходит на вход ровно так же и с `RequireAuth` у `*`, поэтому предыдущие проверки на этом
// не ловятся — переименованный путь или подменённый экран давали зелёный прогон.
it('вошедший на /links/abc видит карточку, а не 404', async () => {
  saveToken('T');
  renderApp('/links/abc');
  expect(await screen.findByText('https://example.com/long')).toBeInTheDocument();
  expect(screen.queryByText('Такой страницы нет')).not.toBeInTheDocument();
});
