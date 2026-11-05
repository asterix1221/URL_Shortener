import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { Pager } from './Pager';

describe('Pager', () => {
  it('на первой странице «Назад» заблокирован, на последней — «Вперёд»', () => {
    const onChange = vi.fn();
    const firstPage = renderWithProviders(
      <Pager page={0} pages={3} size={20} first last={false} onChange={onChange} />
    );
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Вперёд' })).toBeEnabled();
    firstPage.unmount();

    renderWithProviders(<Pager page={2} pages={3} size={20} first={false} last onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Назад' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Вперёд' })).toBeDisabled();
  });

  it('клик ведёт соседнюю страницу, счётчик помечен текущим', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<Pager page={1} pages={3} size={50} first={false} last={false} onChange={onChange} />);
    // `aria-current="page"` на активном элементе требует бриф; цифр через dictionary не выразить,
    // поэтому счётчик — «текущая из всех», а `links.page.size` отдельно говорит, сколько ссылок
    // на страницу (селектора размера в UI нет, `size` приходит из URL-параметра страницы).
    expect(screen.getByText('2 / 3')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Страница по 50')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Вперёд' }));
    expect(onChange).toHaveBeenCalledWith(2);
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('заблокированная кнопка не зовёт onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<Pager page={0} pages={2} size={20} first last={false} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('одной страницы пагинатора нет — переключать нечего', () => {
    const { container } = renderWithProviders(<Pager page={0} pages={1} size={20} first last onChange={vi.fn()} />);
    expect(container.querySelector('nav')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('пустой список — пагинатора нет вовсе', () => {
    const { container } = renderWithProviders(<Pager page={0} pages={0} size={20} first last onChange={vi.fn()} />);
    expect(container.querySelector('nav')).toBeNull();
  });
});
