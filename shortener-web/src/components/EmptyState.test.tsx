import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  // Текст выбирает страница: компонент общий для пустого списка (`links.empty`) и пустой
  // гистограммы с её заголовком (`detail.byDay`, задача 12) — строки разные, поэтому внутри
  // EmptyState не может быть правильного ключа.
  it('показывает текст пустого состояния, который положила страница', () => {
    render(<EmptyState>Ссылок пока нет — создайте первую сверху.</EmptyState>);
    expect(screen.getByText('Ссылок пока нет — создайте первую сверху.')).toBeInTheDocument();
    // пустое состояние не live-регион: `alert` зарезервирован за баннером 429 и ErrorState, а
    // `status` — за тостами; лишние узлы с ролями ломают строгие счётчики задачи 15
    // (`getByRole('alert')` → `toHaveCount(1)`).
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
