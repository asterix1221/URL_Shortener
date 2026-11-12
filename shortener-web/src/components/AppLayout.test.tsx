import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveToken } from '../lib/session';
import { dismissToast, pushToast, readToasts } from '../lib/toast';
import { BASE, renderWithProviders } from '../test/render';
import { AppLayout } from './AppLayout';

const Layout = () => <AppLayout><span data-testid="child">x</span></AppLayout>;

// Стор тостов живёт между тестами: неотпущенное сообщение попалось бы в следующий тест как
// второй `role="status"`, и строгий `getByRole` падал бы не на коде теста.
afterEach(() => {
  readToasts().forEach((item) => dismissToast(item.id));
});

describe('AppLayout', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('заголовок ведёт на список по адресу с префиксом сборки, дети живут в main', () => {
    renderWithProviders(<Layout />);
    expect(screen.getByRole('link', { name: 'Шортенер' })).toHaveAttribute('href', BASE);
    expect(screen.getByRole('main')).toContainElement(screen.getByTestId('child'));
  });

  it('кнопки языка лежат в группе и переключают локаль с сохранением выбора', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Layout />);
    const group = screen.getByRole('group', { name: 'Язык' });
    const [ru, en] = within(group).getAllByRole('button');
    expect(ru).toHaveAccessibleName('RU');
    expect(en).toHaveAccessibleName('EN');
    expect(ru).toHaveAttribute('aria-pressed', 'true');
    expect(en).toHaveAttribute('aria-pressed', 'false');

    await user.click(en);
    expect(screen.getByRole('link', { name: 'Shortener' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
    expect(en).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('shortener.lang')).toBe('en');
  });

  it('кнопка темы — единственная кнопка-иконка, live-региона без тостов нет', () => {
    renderWithProviders(<Layout />);
    const toggle = screen.getByRole('button', { name: 'Тема' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('Toasts смонтирован над main: тост из стора появляется раньше контента', async () => {
    renderWithProviders(<Layout />);
    await act(async () => {
      pushToast('ok', 'links.copied');
    });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Скопировано');
    const following = status.compareDocumentPosition(screen.getByRole('main'));
    expect(following & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('«Выйти» виден ровно когда в sessionStorage лежит токен', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Layout />);
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();

    saveToken('TOKEN');
    renderWithProviders(<Layout />);
    // второй render без cleanup выше — два хедера на странице, поэтому ищем внутри последнего
    const logouts = screen.getAllByRole('button', { name: 'Выйти' });
    expect(logouts).toHaveLength(1);

    await user.click(logouts[0]);
    expect(sessionStorage.getItem('shortener.token')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
  });
});
