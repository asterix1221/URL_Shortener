import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../components/AppLayout';
import { renderWithProviders } from '../test/render';

const user = userEvent.setup();

// Системная тема в тестах берётся из стаба `window.matchMedia` (src/test/setup.ts, матчи = false).
// Две ветки «система просит dark» и «выбор light важнее тёмной системы» стабом недостижимы, поэтому
// тест подменяет матчи через `vi.spyOn`, а `afterEach(vi.restoreAllMocks)` возвращает стаб: иначе
// следующий тест файла жил бы с тёмной системой и его ассерт на светлый дефолт был бы красным не
// из-за кода, а из-за порядка прогонов.
function systemPrefersDark(matches: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string): MediaQueryList => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  }));
}

const Child = () => <AppLayout><span data-testid="child">x</span></AppLayout>;

describe('useTheme', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('дефолт берётся из prefers-color-scheme, выбор запоминается', async () => {
    renderWithProviders(<AppLayout><span data-testid="child">x</span></AppLayout>);
    expect(document.documentElement.dataset.theme).toBe('light');

    await user.click(screen.getByRole('button', { name: /Тема/ }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('shortener.theme')).toBe('dark');
  });

  it('сохранённый выбор важнее системной темы', () => {
    localStorage.setItem('shortener.theme', 'dark');
    renderWithProviders(<AppLayout><span data-testid="child">x</span></AppLayout>);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('переключение возвращает светлую тему и перезаписывает выбор', async () => {
    renderWithProviders(<Child />);
    const toggle = screen.getByRole('button', { name: /Тема/ });
    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('shortener.theme')).toBe('light');
  });

  it('тёмная система без сохранённого выбора даёт тёмную тему', () => {
    systemPrefersDark(true);
    renderWithProviders(<Child />);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('сохранённый светлый выбор важнее тёмной системы', () => {
    systemPrefersDark(true);
    localStorage.setItem('shortener.theme', 'light');
    renderWithProviders(<Child />);
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
