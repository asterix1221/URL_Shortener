import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStorage } from '../test/storage';
import { I18nProvider, useI18n } from './I18nProvider';

/**
 * `localStorage` в тестах не виден как глобал: Node 26 объявляет на `globalThis` аксессор без
 * значения (живёт только с флагом `--localstorage-file`), и vitest 2.1 из-за этого не переносит
 * хранилище jsdom — `getWindowKeys` пропускает ключ, который уже есть в `global` и отсутствует в
 * его списке переносимых ключей. Поэтому тест подставляет ровно то, что в браузере даёт окно:
 * хранилище по ключу. Фабрика общая с мостом из `src/test/setup.ts` (`src/test/storage.ts`), но
 * экземпляр новый на каждый тест, поэтому сброс харнесса этому файлу не нужен: `vi.stubGlobal`
 * перекрывает мост, и чистоту даёт переинсталляция стаба в `beforeEach`.
 */

/**
 * Минимальный потребитель: страница (задачи 10–13) пишет именно так — через useI18n().
 * `t('links.empty')` без vars обязателен: это единственный вызов, покрывающий значение `vars`
 * по умолчанию в `t` (ядро `src/lib` под гейтом 100 % веток).
 */
function Consumer() {
  const { t, setLang } = useI18n();
  return (
    <div>
      <p>{t('links.count', { count: 7 })}</p>
      <p>{t('links.empty')}</p>
      <button type="button" onClick={() => setLang('en')}>switch</button>
    </div>
  );
}

describe('I18nProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });
  afterEach(() => {
    // `cleanup()` больше не локальный: он зарегистрирован один раз в `src/test/setup.ts`
    // (рулинг 8-D) и действует на всю сюиту — здесь остаётся только снятие стаба с `localStorage`.
    vi.unstubAllGlobals();
  });

  it('смена языка перерисовывает строки и пишет выбор в localStorage', async () => {
    const user = userEvent.setup();
    render(<I18nProvider><Consumer /></I18nProvider>);
    expect(screen.getByText('Ссылок: 7')).toBeInTheDocument();
    expect(screen.getByText('Ссылок пока нет — создайте первую сверху.')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('ru');
    await user.click(screen.getByRole('button', { name: 'switch' }));
    expect(screen.getByText('Links: 7')).toBeInTheDocument();
    expect(localStorage.getItem('shortener.lang')).toBe('en');
    expect(document.documentElement.dataset.lang).toBe('en');
  });

  it('английский из localStorage действует уже на первом рендере', () => {
    localStorage.setItem('shortener.lang', 'en');
    render(<I18nProvider><Consumer /></I18nProvider>);
    expect(screen.getByText('Links: 7')).toBeInTheDocument();
  });

  it('неизвестное значение в localStorage не роняет первый рендер — остаётся русский', () => {
    localStorage.setItem('shortener.lang', 'de');
    render(<I18nProvider><Consumer /></I18nProvider>);
    expect(screen.getByText('Ссылок: 7')).toBeInTheDocument();
    expect(localStorage.getItem('shortener.lang')).toBe('de');
  });

  it('useI18n вне I18nProvider — ошибка, а не пустой перевод', () => {
    expect(() => render(<Consumer />)).toThrow('useI18n вне I18nProvider');
  });
});
