import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkResponse, LinkStats } from '../api/types';
import { EXPIRED_REDIRECT } from '../auth/sessionExpired';
import { formatCount } from '../lib/format';
import { saveToken } from '../lib/session';
import { renderWithProviders } from '../test/render';
import LinkDetailPage from './LinkDetailPage';

const { mockedNavigate } = vi.hoisted(() => ({ mockedNavigate: vi.fn() }));

// partial-mock: нужен видимый вызов `handleUnauthorized` (он зовёт `navigate`), а `Routes`,
// `Route`, `useParams` и `Link` из харнесса обязаны остаться настоящими — код ссылки читается
// из параметров маршрута, без этого страница ушла бы в «не найдена» ещё до запроса.
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockedNavigate
}));

const LINK: LinkResponse = {
  code: 'abc',
  shortUrl: 'http://localhost:28080/a/abc',
  originalUrl: 'https://example.com/long',
  createdAt: '2026-11-01T10:00:00Z',
  expiresAt: null,
  maxClicks: null,
  active: true
};

const statsOf = (patch: Partial<LinkStats> = {}): LinkStats => ({
  code: 'abc',
  totalClicks: 1234,
  byDay: [
    { date: '2026-11-03', count: 2 },
    { date: '2026-11-04', count: 5 }
  ],
  topReferrers: [
    { referrer: 'https://news.example', count: 9 },
    { referrer: '', count: 3 }
  ],
  ...patch
});

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const fail = (status: number, message: string): Response =>
  new Response(`{"status":${status},"message":${JSON.stringify(message)}}`, { status });

// Ответ отдаётся фабрикой, а не готовым `Response`: тело читается один раз (`client.ts:9`), и
// второй запрос к одному экземпляру дошёл бы до `catch` как «связь не установлена».
const mockByPath = (statsResponse: () => Response, cardResponse: () => Response): void => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
    String(input).endsWith('/stats') ? statsResponse() : cardResponse()
  );
};

// LinkDetailPage читает код из useParams(), поэтому его mounted-обёртка — маршрут, а не голый
// компонент: без <Route> params пустой, и страница ушла бы в ошибку «не найдена» на ровном месте.
const renderDetail = (path: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/links/:code" element={<LinkDetailPage />} />
    </Routes>,
    path
  );

beforeEach(() => {
  // страница запрашивает карточку и статистику при монтировании, токен обязан лежать до рендера
  saveToken('JWT');
  mockedNavigate.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LinkDetailPage', () => {
  it('404 на карточке — нейтральный текст и возврат к списку', async () => {
    // закладка, открытая после перезапуска вкладки: сеанса в `sessionStorage` уже нет, поэтому
    // запрос уходит с `token ?? ''` и всё равно обязан дать ровно одно нейтральное сообщение
    sessionStorage.clear();
    // фабрика ответа, а не один экземпляр: тело читается один раз (`client.ts:9`), и при
    // `mockResolvedValue` второй запрос падал бы в `catch` на `client.ts:48` как `status: 0`, а
    // «чей текст показать» решался бы порядком продолжений двух `useAsync`, а не моком
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('{"status":404,"message":"link not found"}', { status: 404 }))
    );
    renderDetail('/links/nope');
    expect(await screen.findByText(/не найдена или не ваша/i)).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /К списку/i })).toHaveAttribute('href', '/app/');
  });

  it('статистика догоняет: кнопка обновления повторит только /stats', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/stats')
        ? new Response('{"code":"abc","totalClicks":2,"byDay":[],"topReferrers":[]}', { status: 200 })
        : new Response(JSON.stringify(LINK), { status: 200 })
    );
    renderDetail('/links/abc');
    // клику обязан предшествовать конец первого запроса: кнопка обновления неактивна, пока
    // статистика грузится, и клик, пришедший в этот момент, молча провалился бы — число вызовов
    // стало бы гонкой вместо проверки
    await screen.findByText(/по дням/i);
    await user.click(screen.getByRole('button', { name: /Обновить/i }));
    expect(fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.endsWith('/stats'))).toHaveLength(2);
    expect(fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.endsWith('/links/abc'))).toHaveLength(1);
  });

  it('карточка со статистикой: крупное число, график по дням и источники с прямыми', async () => {
    mockByPath(() => ok(statsOf()), () => ok(LINK));
    renderDetail('/links/abc');

    expect(await screen.findByRole('img', { name: /по дням/i })).toBeInTheDocument();
    // `data-metric` — точка, за которую ждёт сценарий `stats.spec.ts`: она не зависит от локализации
    // текста вокруг числа. Сравнение точное, а не через `toHaveTextContent`: `formatCount` для `ru`
    // вставляет неразрывный пробел, а нормализация пробелов в матчере съедает разницу между ним
    // и обычным пробелом
    expect(document.querySelector('[data-metric="total-clicks"]')!.textContent).toBe(formatCount(1234, 'ru'));
    expect(screen.getByText(/статистика догоняет/i)).toBeInTheDocument();
    expect(screen.getByText('https://example.com/long')).toBeInTheDocument();

    // спека (строка 152) обещает действие «открыть в новой вкладке», а словарь `links.open` до этой
    // правки нигде не вызывался. `rel="noopener"` — не косметика: без него новая вкладка держит
    // `window.opener` и может переписать адрес родительской.
    const open = screen.getByRole('link', { name: /Открыть/i });
    expect(open).toHaveAttribute('href', LINK.shortUrl);
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener');

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('https://news.example')).toBeInTheDocument();
    // пустая строка в ответе сервера — это прямой переход, а не пустая ячейка
    expect(within(table).getByText(/Прямые переходы/i)).toBeInTheDocument();
  });

  it('пустая статистика — два EmptyState под той же постоянной подписью', async () => {
    mockByPath(
      () => ok(statsOf({ totalClicks: 0, byDay: [], topReferrers: [] })),
      () => ok(LINK)
    );
    renderDetail('/links/abc');
    expect(await screen.findByText(/по дням/i)).toBeInTheDocument();
    expect(screen.getByText(/источники/i)).toBeInTheDocument();
    expect(document.querySelectorAll('rect.bar')).toHaveLength(0);
    expect(document.querySelector('[data-metric="total-clicks"]')).toHaveTextContent(formatCount(0, 'ru'));
  });

  it('статистика легла, карточка жива: один alert и одна кнопка обновления', async () => {
    mockByPath(
      () => fail(500, 'kafka unavailable'),
      () => ok(LINK)
    );
    renderDetail('/links/abc');
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Сервис недоступен');
    expect(screen.getByText('https://example.com/long')).toBeInTheDocument();
    // кнопка `detail.refresh` на панели статистики одна: `ErrorState` сюда без `retry` — вторая
    // «Обновить» рядом с ней читалась бы как два разных действия
    expect(screen.getAllByRole('button', { name: /Обновить/i })).toHaveLength(1);
  });

  it('401 с карточки увёл бы сеанс, а не оставил два баннера', async () => {
    // один ответ на оба запроса: `handleUnauthorized` вызывается из `guard` до показа ошибки,
    // поэтому экран получает сообщение `auth.session.expired` ровно в одном `role="alert"`
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(fail(401, 'token expired')));
    renderDetail('/links/abc');
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Сессия истекла, войдите снова.');
    expect(mockedNavigate).toHaveBeenCalledWith(EXPIRED_REDIRECT, { replace: true });
  });
});
