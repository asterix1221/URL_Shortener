import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { dismissToast, readToasts } from '../lib/toast';
import { CopyButton } from './CopyButton';

const SHORT_URL = 'http://localhost:28080/app/abc123';

// Измеренный факт этого стенда (jsdom 25): `window.isSecureContext`, `navigator.clipboard` и
// `document.execCommand` — `undefined`, поэтому тест навешивает их сам и снимает в `afterEach`.
// Иначе защищённая ветка проверялась бы вызовом `undefined`, а `textarea[data-copy-fallback]`
// осталась бы единственной непокрытой.
// `navigator.clipboard` навешивается через `defineProperty`, а не присваиванием: только так заглушка
// становится своим `configurable` свойством и снимается в `afterEach` при любом виде окружения —
// нет ли свойства вовсе (jsdom 25 на этой стойке) или оно отдаётся геттером из `Navigator.prototype`.
// `value: undefined` нужен третьей проверке: защищённый контекст есть, Clipboard API нет.
function stubClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true, writable: true });
}

function secureContext(value: boolean): void {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true, writable: true });
}

const fallbackArea = (): HTMLTextAreaElement => {
  const area = document.querySelector<HTMLTextAreaElement>('textarea[data-copy-fallback]');
  if (area === null) throw new Error('textarea[data-copy-fallback] отсутствует в DOM');
  return area;
};

afterEach(() => {
  Reflect.deleteProperty(window, 'isSecureContext');
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
  readToasts().forEach((item) => dismissToast(item.id));
  vi.restoreAllMocks();
});

describe('CopyButton', () => {
  it('в защищённом контексте пишет полный короткий адрес и даёт тост', async () => {
    const user = userEvent.setup();
    secureContext(true);
    const writeText = vi.fn(async () => {});
    stubClipboard({ writeText });

    renderWithProviders(<CopyButton shortUrl={SHORT_URL} code="abc123" />);
    // доступное имя ровно «Копировать {code}»: e2e задачи 15 ищет кнопку целиком,
    // `getByRole('button', { name: 'Копировать ui-auth-1' })`
    const button = screen.getByRole('button', { name: 'Копировать abc123' });
    expect(document.querySelector('textarea[data-copy-fallback]')).toBeNull();

    await user.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SHORT_URL));
    expect(readToasts().map((item) => item.key)).toEqual(['links.copied']);
  });

  it('в незащищённом контексте готовит значение в скрытом textarea и зовёт execCommand', async () => {
    const user = userEvent.setup();
    secureContext(false);
    stubClipboard(undefined);
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;

    renderWithProviders(<CopyButton shortUrl={SHORT_URL} code="abc123" />);
    await user.click(screen.getByRole('button', { name: 'Копировать abc123' }));

    expect(fallbackArea()).toHaveValue(SHORT_URL);
    expect(execCommand).toHaveBeenCalledWith('copy');
    // `hidden` и `display: none` запрещены: в Chromium у скрытого элемента `select()` не задаёт
    // диапазон, и `execCommand('copy')` копирует пустое место. Проверяется не строка стиля, а её
    // следствие — элемент смещён за границу вьюпорта (`position: fixed`), а не скрыт от раскладки.
    expect(fallbackArea().hasAttribute('hidden')).toBe(false);
    expect(getComputedStyle(fallbackArea()).position).toBe('fixed');
    expect(readToasts().map((item) => item.key)).toEqual(['links.copied']);
  });

  it('защищённый контекст без Clipboard API тоже уходит в textarea', async () => {
    const user = userEvent.setup();
    secureContext(true);
    stubClipboard(undefined);
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;

    renderWithProviders(<CopyButton shortUrl={SHORT_URL} code="abc123" />);
    await user.click(screen.getByRole('button', { name: 'Копировать abc123' }));

    expect(fallbackArea()).toHaveValue(SHORT_URL);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});
