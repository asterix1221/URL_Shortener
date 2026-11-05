import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('без retry показывает только текст ошибки', () => {
    renderWithProviders(<ErrorState message="Сервис недоступен" />);
    // роль `alert` зафиксирована спекой: ErrorState и баннер 429 — единственные alert'ы на странице,
    // и пустое/загруженное состояние не должно добавлять второй узел с этой ролью
    expect(screen.getByRole('alert')).toHaveTextContent('Сервис недоступен');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('с retry добавляет кнопку и зовёт обработчик', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    renderWithProviders(<ErrorState message="Сервис недоступен" retry={retry} />);

    await user.click(screen.getByRole('button', { name: 'Обновить' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
