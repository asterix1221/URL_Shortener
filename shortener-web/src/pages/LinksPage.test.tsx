import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkResponse, Page } from '../api/types';
import { EXPIRED_REDIRECT } from '../auth/sessionExpired';
import { saveToken } from '../lib/session';
import { dismissToast, readToasts } from '../lib/toast';
import { renderWithProviders } from '../test/render';
import LinksPage from './LinksPage';

const { mockedNavigate } = vi.hoisted(() => ({ mockedNavigate: vi.fn() }));

// partial-mock: нужен видимый вызов `handleUnauthorized` (он зовёт `navigate`), а `useSearchParams`
// и `MemoryRouter` из харнесса обязаны остаться настоящими — пагинация живёт в URL-параметрах.
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockedNavigate
}));

const link = (patch: Partial<LinkResponse> = {}): LinkResponse => ({
  code: 'abc123',
  shortUrl: 'http://localhost:28080/app/abc123',
  originalUrl: 'https://example.com/very/long/path',
  createdAt: '2026-11-01T10:00:00Z',
  expiresAt: null,
  maxClicks: null,
  active: true,
  ...patch
});

const pageOf = (content: LinkResponse[], patch: Partial<Page<LinkResponse>> = {}): Page<LinkResponse> => ({
  content,
  number: 0,
  size: 20,
  totalElements: content.length,
  totalPages: 1,
  first: true,
  last: true,
  ...patch
});

const ok = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const failureResponse = (status: number, message: string, headers?: Record<string, string>): Response =>
  new Response(`{"status":${status},"message":${JSON.stringify(message)}}`, { status, headers });

// `vi.spyOn(globalThis, 'fetch')` отдаёт `MockInstance` со своим дженериком, и вписать его в
// параметр хелпера нельзя — только структурный срез того, что реально читает тест.
type FetchMock = { mock: { calls: unknown[][] } };

const paths = (mock: FetchMock): string[] => mock.mock.calls.map((call) => String(call[0]));

const bodyOf = (mock: FetchMock, method: string): unknown => {
  const call = mock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === method);
  return call === undefined ? undefined : JSON.parse(String((call[1] as RequestInit).body));
};

// Наружу от ветки `token ?? ''` виден только заголовок: `client.ts:22` кладёт `Authorization`
// лишь на непустом токене, поэтому отсутствие заголовка у POST/DELETE и есть проверяемое
// следствие того, что страница дошла до вызова без токена, а не упала на нём.
const authHeaderOf = (mock: FetchMock, method: string): string | undefined => {
  const call = mock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === method);
  if (call === undefined) return undefined;
  const headers = (call[1] as RequestInit).headers as Record<string, string> | undefined;
  return headers?.Authorization;
};

// Стор тостов живёт между тестами файла: неснятый тост ушёл бы в следующий тест, где ассерт
// `readToasts()` проверяет уже чужой результат.
afterEach(() => {
  readToasts().forEach((item) => dismissToast(item.id));
  vi.restoreAllMocks();
});

beforeEach(() => {
  sessionStorage.clear();
  mockedNavigate.mockClear();
  // страница запрашивает список при монтировании, поэтому токен обязан лежать до рендера
  saveToken('JWT');
});

describe('LinksPage', () => {
  it('после 429 кнопка заблокирована и тикает Retry-After', async () => {
    const user = userEvent.setup();
    // ответ списка отделён `Once`: иначе 429 ушёл бы и в `listLinks`, на странице появились бы
    // два `role="alert"` (баннер лимита и `ErrorState`), и `findByRole` бросил бы в strict mode
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok(pageOf([link()])))
      .mockResolvedValue(failureResponse(429, 'too many link creations', { 'Retry-After': '3' }));
    renderWithProviders(<LinksPage />, '/');
    await user.type(screen.getByLabelText(/Длинный адрес/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    const submit = screen.getByRole('button', { name: 'Создать' });
    await waitFor(() => expect(submit).toBeDisabled());
    const banners = await screen.findAllByRole('alert');
    expect(banners).toHaveLength(1);
    expect(banners[0]).toHaveTextContent('Слишком часто: лимит на создание ссылок в минуту');
    expect(Number(/(\d+)/.exec(banners[0]?.textContent ?? '')?.[1])).toBeLessThanOrEqual(3);

    // таймеры настоящие: fake timers ломают userEvent, а 3 секунды — приемлемая цена за честный тест
    await waitFor(() => expect(submit).toBeEnabled(), { timeout: 5_000 });
  });

  it('пустой список — EmptyState без таблицы', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok(pageOf([])));
    renderWithProviders(<LinksPage />, '/');
    expect(await screen.findByText('Ссылок пока нет — создайте первую сверху.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('заголовок берёт число из totalElements, а не из длины текущей страницы', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok(pageOf([link()], { totalElements: 42, last: false })));
    renderWithProviders(<LinksPage />, '/');
    expect(await screen.findByText('Ссылок: 42')).toBeInTheDocument();
  });

  it('строка таблицы: одна ссылка с именем-кодом, data-short-url и подписи ячеек', async () => {
    const row = link({ code: 'zzz999', expiresAt: '2020-01-01T00:00:00Z', maxClicks: 5, active: false });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok(pageOf([link(), row])));
    renderWithProviders(<LinksPage />, '/');

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    // `thead` даёт первую строку, строки данных — по числу элементов `content`
    expect(rows).toHaveLength(3);

    const first = rows[1] as HTMLTableRowElement;
    // одна ссылка на строку и имя ровно код: e2e задачи 15 ищет `getByRole('link', { name: code,
    // exact: true })`, а в RTL строковый `name` уже сравнивается целиком (отдельного `exact` у
    // `getByRole` нет) — вторая ссылка с кодом в имени включила бы strict mode и там, и там
    expect(within(first).getAllByRole('link')).toHaveLength(1);
    const anchor = within(first).getByRole('link', { name: 'abc123' });
    expect(anchor).toHaveAttribute('href', '/app/links/abc123');
    expect(anchor).toHaveAttribute('data-short-url', 'http://localhost:28080/app/abc123');

    // подпись каждой ячейки — тот же перевод, что и у колонки: ниже 900px `thead` скрыт
    // (`base.css:276`), и `content: attr(data-label)` (`:295`) остаётся единственным способом
    // отличить значение в карточке
    const labels = Array.from(first.querySelectorAll('td')).map((cell) => cell.getAttribute('data-label'));
    expect(labels).toEqual([
      'Код',
      'Адрес',
      'Длинный адрес',
      'Создана',
      'Истекает',
      'Лимит',
      'Статус',
      'Действия'
    ]);
    expect(within(first).getByText('никогда')).toBeInTheDocument();
    expect(within(first).getByText('—')).toBeInTheDocument();
    expect(within(first).getByText('Активна')).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'Копировать abc123' })).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'Удалить abc123' })).toBeInTheDocument();

    const second = rows[2] as HTMLTableRowElement;
    expect(within(second).getByRole('link', { name: 'zzz999' })).toBeInTheDocument();
    expect(within(second).getByText('5')).toBeInTheDocument();
    expect(within(second).getByText('Удалена')).toBeInTheDocument();
  });

  it('создание шлёт только заполненные поля и перезапрашивает список', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok(pageOf([link()])))
      .mockResolvedValueOnce(ok(link({ code: 'newcode' }), 201))
      .mockResolvedValue(ok(pageOf([link(), link({ code: 'newcode' })])));
    renderWithProviders(<LinksPage />, '/');
    await user.type(screen.getByLabelText(/Длинный адрес/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    await waitFor(() => expect(paths(fetchMock)).toHaveLength(3));
    // пустые необязательные поля уходят отсутствующими ключами, а не `""`/`null`: сервер трактует
    // `expiresAt: ""` как неразбираемый `Instant`
    expect(bodyOf(fetchMock, 'POST')).toEqual({ url: 'https://example.com' });
    expect(paths(fetchMock)[2]).toBe('/api/links?page=0&size=20');
    expect(await screen.findByText('Ссылок: 2')).toBeInTheDocument();
  });

  it('создание со второй страницы перезапрашивает первую', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok(pageOf([link()], { number: 1, first: false, last: false, totalElements: 42 })))
      .mockResolvedValueOnce(ok(link({ code: 'newcode' }), 201))
      .mockResolvedValue(ok(pageOf([link()], { number: 0, totalElements: 43, last: false })));
    renderWithProviders(<LinksPage />, '/?page=1');
    await user.type(screen.getByLabelText(/Длинный адрес/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    await waitFor(() => expect(paths(fetchMock)).toHaveLength(3));
    expect(paths(fetchMock)[2]).toBe('/api/links?page=0&size=20');
  });

  it('удаление через диалог: 204, тост и перезапрос списка', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok(pageOf([link()])))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValue(ok(pageOf([])));
    renderWithProviders(<LinksPage />, '/');
    await user.click(await screen.findByRole('button', { name: 'Удалить abc123' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Удалить ссылку abc123?');
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(paths(fetchMock)).toHaveLength(3));
    expect(paths(fetchMock)[1]).toBe('/api/links/abc123');
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('DELETE');
    expect(await screen.findByText('Ссылок пока нет — создайте первую сверху.')).toBeInTheDocument();
    expect(readToasts().map((item) => item.key)).toEqual(['links.deleted']);
  });

  it('Esc закрывает диалог и возвращает фокус кнопке строки', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok(pageOf([link()])));
    renderWithProviders(<LinksPage />, '/');

    const trigger = await screen.findByRole('button', { name: 'Удалить abc123' });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // безопасный вариант по умолчанию: при открытии фокус уходит на «Отмена», а не на «Удалить»
    expect(document.activeElement).toBe(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }));

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('ошибка удаления — тост ошибки и никакого перезапроса', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok(pageOf([link()])))
      .mockResolvedValueOnce(failureResponse(404, 'link not found: abc123'));
    renderWithProviders(<LinksPage />, '/');
    await user.click(await screen.findByRole('button', { name: 'Удалить abc123' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(readToasts().map((item) => item.key)).toEqual(['errors.notFound']));
    expect(paths(fetchMock)).toHaveLength(2);
    expect(screen.queryByText('Ссылка не найдена или не ваша')).not.toBeInTheDocument();
  });

  it('список упал — ErrorState с «Обновить», форма остаётся на странице', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(failureResponse(500, 'boom'))
      .mockResolvedValue(ok(pageOf([link()])));
    renderWithProviders(<LinksPage />, '/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    // задача 13 проверяет гард по кнопке формы, а создание ссылки должно быть возможно, пока
    // список лежит
    expect(screen.getByRole('button', { name: 'Создать' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Обновить' }));
    await waitFor(() => expect(paths(fetchMock)).toHaveLength(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('401 на списке уводит на вход с флагом истёкшей сессии', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(failureResponse(401, 'JWT expired'));
    renderWithProviders(<LinksPage />, '/');
    await waitFor(() => expect(mockedNavigate).toHaveBeenCalledWith(EXPIRED_REDIRECT, { replace: true }));
  });

  it('без токена создание и удаление уходят без Authorization, а не со `Bearer null`', async () => {
    const user = userEvent.setup();
    // токен снят до рендера: `AuthProvider` читает его один раз инициализатором `useState`
    // (`AuthProvider.tsx:23`), поэтому ветка `token ?? ''` в `submit` и `remove`
    // (`LinksPage.tsx:80,94`) в остальных тестах файла недоступна — там `beforeEach` токен кладёт
    sessionStorage.clear();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok(pageOf([link()])))
      .mockResolvedValueOnce(ok(link({ code: 'newcode' }), 201))
      .mockResolvedValueOnce(ok(pageOf([link()])))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValue(ok(pageOf([])));
    renderWithProviders(<LinksPage />, '/');
    await user.type(screen.getByLabelText(/Длинный адрес/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Создать' }));
    await waitFor(() => expect(bodyOf(fetchMock, 'POST')).toEqual({ url: 'https://example.com' }));
    expect(authHeaderOf(fetchMock, 'POST')).toBeUndefined();

    await user.click(await screen.findByRole('button', { name: 'Удалить abc123' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(paths(fetchMock)).toHaveLength(5));
    // запрос удаления обязан существовать, иначе следующая строка была бы проходной по пустоте:
    // `authHeaderOf` отдаёт `undefined` и для вызова, которого нет
    expect(paths(fetchMock)[3]).toBe('/api/links/abc123');
    expect((fetchMock.mock.calls[3]?.[1] as RequestInit).method).toBe('DELETE');
    expect(authHeaderOf(fetchMock, 'DELETE')).toBeUndefined();
    // отработанный вызов обязан дойти до конца: пустой токен не повод молча потерять действие
    expect(readToasts().map((item) => item.key)).toEqual(['links.deleted']);
    expect(await screen.findByText('Ссылок пока нет — создайте первую сверху.')).toBeInTheDocument();
  });

  it('пагинация: «Вперёд» меняет страницу в URL и уходит серверу, «Назад» заблокирован', async () => {
    const user = userEvent.setup();
    const fetched = { totalElements: 42, totalPages: 3, first: true, last: false };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok(pageOf([link()], fetched)))
      .mockResolvedValue(ok(pageOf([link({ code: 'page2' })], { ...fetched, number: 1, first: false })));
    renderWithProviders(<LinksPage />, '/');

    expect(await screen.findByRole('button', { name: 'Назад' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Вперёд' })).toBeEnabled();
    // счётчик страниц (`{текущая} / {всего}`) помечен `aria-current="page"`; отдельного ключа
    // «Страница {n}» в словаре нет, а размер страницы показывает селект (`links.page.sizeLabel`)
    expect(screen.getByText('1 / 3')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('Размер страницы')).toHaveValue('20');

    await user.click(screen.getByRole('button', { name: 'Вперёд' }));
    await waitFor(() => expect(paths(fetchMock)).toHaveLength(2));
    expect(paths(fetchMock)[1]).toBe('/api/links?page=1&size=20');
    expect(await screen.findByRole('button', { name: 'Назад' })).toBeEnabled();
    expect(screen.getByText('2 / 3')).toHaveAttribute('aria-current', 'page');
  });

  it('размер страницы из URL переживает смену страницы', async () => {
    const user = userEvent.setup();
    const fetched = { totalElements: 42, totalPages: 3, first: true, last: false, size: 50 };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok(pageOf([link()], { ...fetched, number: 1, first: false })))
      .mockResolvedValue(ok(pageOf([link({ code: 'page2' })], { ...fetched, number: 2, first: false, last: true })));
    renderWithProviders(<LinksPage />, '/?page=1&size=50');
    await screen.findByRole('button', { name: 'Вперёд' });

    await user.click(screen.getByRole('button', { name: 'Вперёд' }));
    await waitFor(() => expect(paths(fetchMock)).toHaveLength(2));
    // `paramsFor` обязан дописывать НЕдефолтный размер, иначе переход на вторую страницу молча
    // вернул бы `size=20` и пользователь потерял бы свой `?size=50` из пересланной ссылки
    expect(paths(fetchMock)[1]).toBe('/api/links?page=2&size=50');
    expect(screen.getByLabelText('Размер страницы')).toHaveValue('50');
  });

  it('смена размера уходит в запрос с новым size= и page=0', async () => {
    const user = userEvent.setup();
    const fetched = { totalElements: 42, totalPages: 3, first: false, last: false };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok(pageOf([link()], { ...fetched, number: 1 })))
      .mockResolvedValue(ok(pageOf([link({ code: 'size50' })], { number: 0, size: 50, first: true, last: true })));
    // вторая страница в URL: смена размера обязана сбросить номер, иначе сервер вернул бы пустой
    // `content` и список выглядел бы потерянным
    renderWithProviders(<LinksPage />, '/?page=1');
    await screen.findByRole('button', { name: 'Вперёд' });
    expect(screen.getByLabelText('Размер страницы')).toHaveValue('20');

    await user.selectOptions(screen.getByLabelText('Размер страницы'), '50');
    await waitFor(() => expect(paths(fetchMock)).toHaveLength(2));
    expect(paths(fetchMock)[1]).toBe('/api/links?page=0&size=50');
    expect(await screen.findByRole('link', { name: 'size50' })).toBeInTheDocument();
    // `paramsFor(0, 50)` не пишет `page=0`: адрес остаётся коротким, а номер всё равно первая
    expect(screen.queryByRole('button', { name: 'Вперёд' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Размер страницы')).toHaveValue('50');
  });

  it('параметры страницы из URL урезаются до границ сервера с обеих сторон', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok(pageOf([link()])));
    const oversized = renderWithProviders(<LinksPage />, '/?page=2&size=500');
    await waitFor(() => expect(paths(fetchMock)).toHaveLength(1));
    expect(paths(fetchMock)[0]).toBe('/api/links?page=2&size=100');
    oversized.unmount();

    fetchMock.mockClear();
    const junk = renderWithProviders(<LinksPage />, '/?page=abc&size=abc');
    await waitFor(() => expect(paths(fetchMock)).toHaveLength(1));
    expect(paths(fetchMock)[0]).toBe('/api/links?page=0&size=20');
    junk.unmount();

    // отдельные случаи на нижнюю границу: на `abc` в обеих функциях до дефолта доходит первый
    // операнд (`Number.isInteger`), поэтому снятая целиком нижняя граница (`parsed >= 0` у
    // `readPage`, `parsed < MIN_SIZE` у `readSize`) осталась бы неотличимой — а гейт покрытия
    // `src/**` строчный, и V8 не различает, какой операнд `&&` дал `false`. Здесь значения
    // целые, значит запрос уходит на `page=0&size=20` именно благодаря второй проверке
    fetchMock.mockClear();
    renderWithProviders(<LinksPage />, '/?page=-1&size=0');
    await waitFor(() => expect(paths(fetchMock)).toHaveLength(1));
    expect(paths(fetchMock)[0]).toBe('/api/links?page=0&size=20');
  });
});
