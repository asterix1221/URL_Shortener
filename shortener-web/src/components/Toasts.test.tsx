import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissToast, pushToast, readToasts } from '../lib/toast';
import { renderWithProviders } from '../test/render';
import { Toasts } from './Toasts';

const TOAST_TTL_MS = 4000;

// Стор тостов живёт между тестами одного файла: незакрытый тост ушёл бы в следующий тест, и там
// `getByRole('status')` нашёл бы два узла. Разборщики сами по себе — ответственность теста,
// поэтому сброс здесь, а не в харнессе.
afterEach(() => {
  readToasts().forEach((item) => dismissToast(item.id));
  vi.useRealTimers();
});

describe('Toasts', () => {
  it('тост появляется в контейнере role="status" и снимается по таймеру', async () => {
    vi.useFakeTimers();
    pushToast('ok', 'links.copied');
    renderWithProviders(<Toasts />);
    expect(screen.getByRole('status')).toHaveTextContent('Скопировано');

    // `act` — экспорт testing-library, а не `React.act`: обёртка RTL ставит
    // `IS_REACT_ACT_ENVIRONMENT` на время вызова, и React видит обновление из таймера как act;
    // `await act(async …)` держит флаг включённым и до микрозадачи, в которой React отфлешит
    // снятие тоста (синхронная форма снимает флаг раньше).
    await act(async () => {
      vi.advanceTimersByTime(TOAST_TTL_MS);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(readToasts()).toEqual([]);
  });

  it('каждый тост — элемент списка внутри одного контейнера role="status"', () => {
    pushToast('ok', 'links.copied');
    pushToast('error', 'errors.server');
    renderWithProviders(<Toasts />);

    const status = screen.getByRole('status');
    expect(within(status).getAllByRole('listitem')).toHaveLength(2);
    expect(within(status).getByText('Скопировано')).toBeInTheDocument();
    expect(within(status).getByText('Сервис недоступен')).toBeInTheDocument();
    // задача 11 считает `getByRole('alert')` на странице ровно одним: тосты не добавляют роль
    expect(within(status).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('кнопка закрытия снимает тост сразу, без ожидания таймера', () => {
    pushToast('ok', 'links.copied');
    renderWithProviders(<Toasts />);

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(readToasts()).toEqual([]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
