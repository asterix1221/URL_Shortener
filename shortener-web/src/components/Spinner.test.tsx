import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  // Ассерт по классу: элемент выведен из дерева доступных имён (`aria-hidden`), поэтому ролью или
  // текстом его не найти — и это как раз тот контракт, который нужен задаче 10: спиннер не
  // конкурирует с контейнером тостов за `role="status"` и не озвучивает состояние кнопки (у
  // заблокированной кнопки задачи 10 остаётся собственное имя).
  it('спиннер декоративен и не создаёт live-регион', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('.spinner')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
