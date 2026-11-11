import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { Pager } from './Pager';

const sizeChange = () => vi.fn();

describe('Pager', () => {
  it('на первой странице «Назад» заблокирован, на последней — «Вперёд»', () => {
    const onChange = vi.fn();
    const firstPage = renderWithProviders(
      <Pager page={0} pages={3} size={20} first last={false} onChange={onChange} onSizeChange={sizeChange()} />
    );
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Вперёд' })).toBeEnabled();
    firstPage.unmount();

    renderWithProviders(
      <Pager page={2} pages={3} size={20} first={false} last onChange={onChange} onSizeChange={sizeChange()} />
    );
    expect(screen.getByRole('button', { name: 'Назад' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Вперёд' })).toBeDisabled();
  });

  it('клик ведёт соседнюю страницу, счётчик помечен текущим', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <Pager page={1} pages={3} size={50} first={false} last={false} onChange={onChange} onSizeChange={sizeChange()} />
    );
    // `aria-current="page"` на активном элементе требует бриф; цифр через dictionary не выразить,
    // поэтому счётчик — «текущая из всех», а сколько ссылок на страницу говорит селект размера.
    expect(screen.getByText('2 / 3')).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: 'Вперёд' }));
    expect(onChange).toHaveBeenCalledWith(2);
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('заблокированная кнопка не зовёт onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <Pager page={0} pages={2} size={20} first last={false} onChange={onChange} onSizeChange={sizeChange()} />
    );
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('одна страница — только селект размера, кнопок и счётчика нет', () => {
    const { container } = renderWithProviders(
      <Pager page={0} pages={1} size={20} first last onChange={vi.fn()} onSizeChange={sizeChange()} />
    );
    // навигация остаётся: размер страницы выбирается и тогда, когда листать нечего
    expect(container.querySelector('nav')).not.toBeNull();
    expect(screen.getByLabelText('Размер страницы')).toHaveValue('20');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
  });

  it('пустой список — селект размера есть, кнопок нет', () => {
    const { container } = renderWithProviders(
      <Pager page={0} pages={0} size={20} first last onChange={vi.fn()} onSizeChange={sizeChange()} />
    );
    expect(container.querySelector('nav')).not.toBeNull();
    expect(screen.getByLabelText('Размер страницы')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('опции размера — ровно 10/20/50/100, текст опций совпадает со значением', () => {
    renderWithProviders(
      <Pager page={0} pages={3} size={20} first last={false} onChange={vi.fn()} onSizeChange={sizeChange()} />
    );
    const select = screen.getByLabelText('Размер страницы');
    const options = within(select).getAllByRole('option');
    expect(options.map((option) => (option as HTMLOptionElement).value)).toEqual(['10', '20', '50', '100']);
    expect(options.map((option) => option.textContent)).toEqual(['10', '20', '50', '100']);
  });

  it('селект показывает текущий размер и носит имя из подписи, а не из aria-label', () => {
    const sized = renderWithProviders(
      <Pager page={0} pages={3} size={100} first last={false} onChange={vi.fn()} onSizeChange={sizeChange()} />
    );
    const select = screen.getByRole('combobox', { name: 'Размер страницы' });
    expect(select).toHaveValue('100');
    expect(select).not.toHaveAttribute('aria-label');
    expect(select).toHaveAttribute('id', 'page-size');
    sized.unmount();

    renderWithProviders(
      <Pager page={0} pages={3} size={10} first last={false} onChange={vi.fn()} onSizeChange={sizeChange()} />
    );
    expect(screen.getByLabelText('Размер страницы')).toHaveValue('10');
  });

  it('смена размера зовёт onSizeChange числом и не трогает onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSizeChange = vi.fn();
    renderWithProviders(
      <Pager page={1} pages={3} size={20} first={false} last={false} onChange={onChange} onSizeChange={onSizeChange} />
    );

    await user.selectOptions(screen.getByLabelText('Размер страницы'), '50');
    expect(onSizeChange).toHaveBeenCalledWith(50);
    expect(onSizeChange).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
