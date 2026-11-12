import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { ConfirmDialog } from './ConfirmDialog';

// Диалог открывается кнопкой строки, а не монтируется напрямую: возврат фокуса проверяется на
// реальном триггере (рулинг брифа — `Esc` возвращает фокус кнопке удаления).
function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Удалить abc123
      </button>
      {open ? (
        <ConfirmDialog
          title="Удалить ссылку abc123?"
          body="Переходы по ней перестанут работать. Данные статистики останутся."
          confirmLabel="Удалить"
          cancelLabel="Отмена"
          onConfirm={onConfirm}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

describe('ConfirmDialog', () => {
  it('модальный диалог подписан заголовком, показывает тело и фокусирует «Отмена»', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness onConfirm={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Удалить abc123' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Удалить ссылку abc123?');
    expect(within(dialog).getByText('Переходы по ней перестанут работать. Данные статистики останутся.')).toBeInTheDocument();
    // безопасный вариант по умолчанию: активная кнопка — отмена, а не удаление
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Отмена' }));
  });

  it('Esc закрывает диалог и возвращает фокус кнопке строки', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness onConfirm={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Удалить abc123' });
    await user.click(trigger);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('Tab и Shift+Tab держат фокус внутри диалога по циклу', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness onConfirm={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Удалить abc123' }));
    const dialog = screen.getByRole('dialog');
    const cancel = within(dialog).getByRole('button', { name: 'Отмена' });
    // строковый `name` в RTL сравнивается целиком, поэтому кнопка строки «Удалить abc123» сюда
    // не попадает — тот же край, что и у e2e-локатора задачи 15 (`getByRole('button', { name:
    // 'Удалить', exact: true })`)
    const confirm = within(dialog).getByRole('button', { name: 'Удалить' });

    await user.tab();
    expect(document.activeElement).toBe(confirm);
    // с последней кнопки Tab обязан вернуться на первую, а не уйти в документ за диалогом
    await user.tab();
    expect(document.activeElement).toBe(cancel);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('другая клавиша ничего не переносит', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness onConfirm={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Удалить abc123' }));
    const cancel = within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' });

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(cancel);
  });

  it('Tab из фокуса, ушедшего за диалог, возвращает его обратно', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness onConfirm={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Удалить abc123' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog');

    // фокус мог уйти наружу кликом по фону страницы: `Tab` обязан вернуть его в диалог с края,
    // а не оставить модальное окно без активного элемента
    trigger.focus();
    await user.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Отмена' }));

    trigger.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Удалить' }));
  });

  it('«Удалить» подтверждает, «Отмена» закрывает без подтверждения', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Удалить abc123' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Удалить abc123' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
