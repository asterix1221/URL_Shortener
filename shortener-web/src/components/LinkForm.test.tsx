import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../api/types';
import { renderWithProviders } from '../test/render';
import { LinkForm } from './LinkForm';

const failure = (patch: Partial<ApiFailure>): ApiFailure => ({
  status: 500,
  message: 'boom',
  retryAfterSeconds: null,
  ...patch
});

// `onSubmit` — граница формы: она возвращает результат слоя (`null` — успех), а транспорт и
// гард 401 выбирает страница. Аргумент в стабе не объявлен: mock записывает вызовы всё равно,
// а неиспользуемый параметр поймал бы `no-unused-vars`.
const submitWith = (value: ApiFailure | null) => vi.fn(async (): Promise<ApiFailure | null> => value);

afterEach(() => vi.restoreAllMocks());

describe('LinkForm', () => {
  it('пустое поле url не отпускает запрос и подсвечивает само поле', async () => {
    const user = userEvent.setup();
    const onSubmit = submitWith(null);
    renderWithProviders(<LinkForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    const url = screen.getByLabelText(/Длинный адрес/i);
    expect(url).toHaveAttribute('aria-invalid', 'true');
    expect(url).toHaveAccessibleDescription('Обязательное поле');
    expect(onSubmit).not.toHaveBeenCalled();
    // единственный `role="alert"` на странице (рулинг 11-J): ошибка поля — текст у поля, не баннер
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // подсказки отдаёт наша валидация, а не браузер: `noValidate` обязан стоять на форме
    expect(document.querySelector('form')).toHaveAttribute('novalidate');
    expect(url).toHaveAttribute('type', 'url');
    expect(screen.getByLabelText(/Лимит переходов/i)).toHaveAttribute('inputmode', 'numeric');
  });

  it('каждое неверное поле получает свою подсказку одновременно', async () => {
    const user = userEvent.setup();
    const onSubmit = submitWith(null);
    renderWithProviders(<LinkForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Длинный адрес/i), 'https://example.com');
    await user.type(screen.getByLabelText(/Свой код/i), 'ab');
    await user.type(screen.getByLabelText(/Истекает/i), '2020-01-01T00:00');
    await user.type(screen.getByLabelText(/Лимит переходов/i), '1.5');
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    expect(screen.getByLabelText(/Свой код/i)).toHaveAccessibleDescription(
      '3–32 символа: латиница, цифры, дефис, подчёркивание'
    );
    expect(screen.getByLabelText(/Истекает/i)).toHaveAccessibleDescription('Срок должен быть в будущем');
    expect(screen.getByLabelText(/Лимит переходов/i)).toHaveAccessibleDescription('Целое число');
    expect(screen.getByLabelText(/Длинный адрес/i)).toHaveAttribute('aria-invalid', 'false');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('409 без префикса поля кладёт текст про занятый код под alias', async () => {
    const user = userEvent.setup();
    const onSubmit = submitWith(failure({ status: 409, message: 'alias already taken: my-code' }));
    renderWithProviders(<LinkForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Длинный адрес/i), 'https://example.com');
    await user.type(screen.getByLabelText(/Свой код/i), 'my-code');
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    expect(await screen.findByText('Такой код уже используется')).toBeInTheDocument();
    expect(screen.getByLabelText(/Свой код/i)).toHaveAccessibleDescription('Такой код уже используется');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('400 с префиксом url кладёт локализованный текст под инпут url', async () => {
    const user = userEvent.setup();
    const onSubmit = submitWith(failure({ status: 400, message: 'url: must be a valid http(s) URL' }));
    renderWithProviders(<LinkForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Длинный адрес/i), 'ftp://example.com');
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    expect(await screen.findByText('Сервер отклонил данные')).toBeInTheDocument();
    expect(screen.getByLabelText(/Длинный адрес/i)).toHaveAccessibleDescription('Сервер отклонил данные');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('префикс не из этой формы кладёт текст под форму, а не под поле', async () => {
    const user = userEvent.setup();
    // `email` есть в KNOWN_FIELDS (`errors.ts:24`), но инпута такого поля в форме создания нет
    const onSubmit = submitWith(failure({ status: 400, message: 'email: must be a well-formed address' }));
    renderWithProviders(<LinkForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Длинный адрес/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервер отклонил данные');
    expect(screen.getByLabelText(/Длинный адрес/i)).toHaveAttribute('aria-invalid', 'false');
  });

  it('500 даёт текст про сервис недоступен под формой', async () => {
    const user = userEvent.setup();
    const onSubmit = submitWith(failure({ status: 500, message: 'java.lang.IllegalStateException' }));
    renderWithProviders(<LinkForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Длинный адрес/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
  });

  it('ввод в поле после серверной ошибки убирает её текст', async () => {
    const user = userEvent.setup();
    const onSubmit = submitWith(failure({ status: 409, message: 'alias already taken: my-code' }));
    renderWithProviders(<LinkForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Длинный адрес/i), 'https://example.com');
    await user.type(screen.getByLabelText(/Свой код/i), 'my-code');
    await user.click(screen.getByRole('button', { name: 'Создать' }));
    expect(await screen.findByText('Такой код уже используется')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Свой код/i), '-2');
    expect(screen.queryByText('Такой код уже используется')).not.toBeInTheDocument();
  });

  it('429 с Retry-After блокирует кнопку и показывает отсчёт в одном alert', async () => {
    const user = userEvent.setup();
    const onSubmit = submitWith(failure({ status: 429, message: 'too many link creations', retryAfterSeconds: 1 }));
    renderWithProviders(<LinkForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Длинный адрес/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    const submit = screen.getByRole('button', { name: 'Создать' });
    await waitFor(() => expect(submit).toBeDisabled());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Слишком часто: лимит на создание ссылок в минуту');
    expect(alert).toHaveTextContent('Отправить снова через 1 с');

    await waitFor(() => expect(submit).toBeEnabled(), { timeout: 3_000 });
  });

  it('429 без Retry-After показывает лимит без отсчёта и не блокирует кнопку', async () => {
    const user = userEvent.setup();
    const onSubmit = submitWith(failure({ status: 429, message: 'too many link creations' }));
    renderWithProviders(<LinkForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Длинный адрес/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Слишком часто: лимит на создание ссылок в минуту');
    expect(alert).not.toHaveTextContent('Отправить снова');
    expect(screen.getByRole('button', { name: 'Создать' })).toBeEnabled();
  });

  it('успех: поля приведены к payload, ошибок ни на форме, ни на полях', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async (): Promise<ApiFailure | null> => null);
    renderWithProviders(<LinkForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Длинный адрес/i), 'https://example.com');
    await user.type(screen.getByLabelText(/Свой код/i), ' my-code ');
    await user.type(screen.getByLabelText(/Истекает/i), '2026-12-01T08:30');
    await user.type(screen.getByLabelText(/Лимит переходов/i), '5');
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // локальное время `datetime-local` уходит абсолютным `Instant`, `maxClicks` — числом, а пробелы
    // срезаны формой (`type="url"` в jsdom срезает их сам, поэтому трим проверяется на alias-инпуте)
    expect(onSubmit).toHaveBeenCalledWith({
      url: 'https://example.com',
      alias: 'my-code',
      expiresAt: new Date('2026-12-01T08:30').toISOString(),
      maxClicks: 5
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Длинный адрес/i)).toHaveAttribute('aria-invalid', 'false');
  });
});
