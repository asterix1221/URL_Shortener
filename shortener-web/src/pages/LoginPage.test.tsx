import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadToken } from '../lib/session';
import { renderWithProviders } from '../test/render';
import LoginPage from './LoginPage';

const { mockedNavigate } = vi.hoisted(() => ({ mockedNavigate: vi.fn() }));

// partial-mock: нужно видеть вызов `navigate('/')` после успеха, а `MemoryRouter` из `render.tsx`
// и `useSearchParams` (читает `?expired`) обязаны остаться настоящими. Мокается единственный
// спецификатор `react-router-dom`, под которым импортируют роутер и страница, и провайдер.
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockedNavigate
}));

// `fetch` здесь — настоящая реализация Node, а не стаб: неотпущенный шпион ушёл бы в следующий
// файл и дал бы ему сетевую ошибку вместо ответа мока.
afterEach(() => vi.restoreAllMocks());

describe('LoginPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockedNavigate.mockClear();
  });

  it('регистрация делает два запроса и приводит в список', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 201 }))   // register
      .mockResolvedValueOnce(new Response('{"accessToken":"T","expiresIn":3600}', { status: 200 }));
    renderWithProviders(<LoginPage />, '/login');
    await user.click(screen.getByRole('tab', { name: /Регистрация/i }));
    await user.type(screen.getByLabelText(/Электронная почта/i), 'a@b.co');
    await user.type(screen.getByLabelText(/Пароль/i), 'Passw0rd!');
    await user.click(screen.getByRole('button', { name: /Создать аккаунт/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(loadToken()).toBe('T');
    expect(mockedNavigate).toHaveBeenCalledWith('/');
  });

  it('409 на занятый email — ошибка под полем email, а не под формой', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"status":409,"message":"email already registered"}', { status: 409 }));
    renderWithProviders(<LoginPage />, '/login');
    await user.click(screen.getByRole('tab', { name: /Регистрация/i }));
    await user.type(screen.getByLabelText(/Электронная почта/i), 'taken@example.com');
    await user.type(screen.getByLabelText(/Пароль/i), 'Passw0rd!');
    await user.click(screen.getByRole('button', { name: /Создать аккаунт/i }));

    // текст берётся из ключа errorKeyFor({status:409},'auth') = errors.emailTaken, не из message
    expect(await screen.findByText(/Пользователь с такой почтой уже есть/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Электронная почта/i)).toHaveAccessibleDescription('Пользователь с такой почтой уже есть');
    expect(screen.getByLabelText(/Электронная почта/i)).toHaveAttribute('aria-invalid', 'true');
    // серверное сообщение на английском не должно просочиться в интерфейс
    expect(screen.queryByText(/email already registered/i)).not.toBeInTheDocument();
  });

  it('вход делает один запрос и тоже ведёт в список', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"accessToken":"T","expiresIn":3600}', { status: 200 }));
    renderWithProviders(<LoginPage />, '/login');
    await user.type(screen.getByLabelText(/Электронная почта/i), 'a@b.co');
    await user.type(screen.getByLabelText(/Пароль/i), 'Passw0rd!');
    await user.click(screen.getByRole('button', { name: /Войти/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(loadToken()).toBe('T');
    expect(mockedNavigate).toHaveBeenCalledWith('/');
  });

  it('клиентская валидация не отпускает запрос к серверу', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    renderWithProviders(<LoginPage />, '/login');
    await user.type(screen.getByLabelText(/Электронная почта/i), 'not-an-email');
    await user.type(screen.getByLabelText(/Пароль/i), 'short');
    await user.click(screen.getByRole('button', { name: /Войти/i }));

    const email = screen.getByLabelText(/Электронная почта/i);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Нужен адрес вида name@example.com');
    const password = screen.getByLabelText(/Пароль/i);
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAccessibleDescription('Пароль от 8 до 72 символов');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('401 — текст под формой, токен остаётся пустым, навигации нет', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"status":401,"message":"bad credentials"}', { status: 401 }));
    renderWithProviders(<LoginPage />, '/login');
    await user.type(screen.getByLabelText(/Электронная почта/i), 'a@b.co');
    await user.type(screen.getByLabelText(/Пароль/i), 'Passw0rd!');
    await user.click(screen.getByRole('button', { name: /Войти/i }));

    // вход сам по себе сеанс не оканчивает: на этом экране 401 — обычная ошибка формы, а не
    // `handleUnauthorized`, который ушёл бы на /login?expired=1 циклом по самому себе
    expect(await screen.findByRole('alert')).toHaveTextContent('Адрес или пароль неверны');
    expect(screen.getByLabelText(/Электронная почта/i)).toHaveAttribute('aria-invalid', 'false');
    expect(loadToken()).toBeNull();
    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it('400 с префиксом поля кладёт локализованный текст под это поле', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"status":400,"message":"password: size must be between 8 and 72"}', { status: 400 }));
    renderWithProviders(<LoginPage />, '/login');
    await user.type(screen.getByLabelText(/Электронная почта/i), 'a@b.co');
    await user.type(screen.getByLabelText(/Пароль/i), 'Passw0rd!');
    await user.click(screen.getByRole('button', { name: /Войти/i }));

    expect(await screen.findByText('Сервер отклонил данные')).toBeInTheDocument();
    expect(screen.getByLabelText(/Пароль/i)).toHaveAccessibleDescription('Сервер отклонил данные');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('флаг ?expired от handleUnauthorized даёт баннер с ролью status', () => {
    renderWithProviders(<LoginPage />, '/login?expired=1');
    expect(screen.getByRole('status')).toHaveTextContent('Сессия истекла, войдите снова.');
  });

  it('без флага живого региона на экране нет', () => {
    renderWithProviders(<LoginPage />, '/login');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('на время запроса кнопка блокируется', async () => {
    const user = userEvent.setup();
    let settle: (response: Response) => void = () => {};
    vi.spyOn(globalThis, 'fetch')
      .mockReturnValue(new Promise<Response>((resolve) => { settle = resolve; }));
    renderWithProviders(<LoginPage />, '/login');
    await user.type(screen.getByLabelText(/Электронная почта/i), 'a@b.co');
    await user.type(screen.getByLabelText(/Пароль/i), 'Passw0rd!');

    const button = screen.getByRole('button', { name: /Войти/i });
    await user.click(button);
    expect(button).toBeDisabled();
    // спиннер обязано видно в DOM, но не в дереве доступных имён: он `aria-hidden`, и доступное
    // имя кнопки обязано остаться «Войти», чтобы локаторы выше находили её и во время запроса
    expect(button.querySelector('.spinner')).not.toBeNull();
    settle(new Response('{"accessToken":"T","expiresIn":3600}', { status: 200 }));
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(loadToken()).toBe('T');
  });

  it('подсказка под формой переключает режим', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, '/login');
    expect(screen.getByRole('tab', { name: /Вход/i })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: /Нет аккаунта\?/i }));
    expect(screen.getByRole('tab', { name: /Регистрация/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /Создать аккаунт/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Уже есть аккаунт\?/i }));
    expect(screen.getByRole('tab', { name: /Вход/i })).toHaveAttribute('aria-selected', 'true');
  });
});
