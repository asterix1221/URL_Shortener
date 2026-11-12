import { useEffect, useId, useRef } from 'react';

type Props = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// Диалог подтверждения удаления. Модальность программная, не CSS-овая: класса подложки в
// `src/styles/` нет (рулинг 11 — новых классов задача не заводит), а `showModal()` в jsdom этого
// стенда отсутствует (`box.current?.showModal is not a function`), так что нативный `<dialog>` не
// дал бы ни ловушки фокуса, ни проверяемых тестов. Отсюда ручной `Tab`-цикл и возврат фокуса.
export function ConfirmDialog({ title, body, confirmLabel, cancelLabel, onConfirm, onCancel }: Props) {
  const labelId = useId();
  const cancel = useRef<HTMLButtonElement | null>(null);
  const confirm = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // снимается до первого `focus()`: активный узел на открытии — кнопка строки, на неё и возврат
    const trigger = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    return () => {
      trigger?.focus();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const order = [cancel.current, confirm.current];
      const index = order.indexOf(document.activeElement as HTMLButtonElement | null);
      const back = event.shiftKey;
      // индекс -1 значит фокус вне диалога (клик по фону, смена страницы) — заход с края
      const next =
        index === -1 ? (back ? order.length - 1 : 0) : (index + (back ? -1 : 1) + order.length) % order.length;
      event.preventDefault();
      order[next]?.focus();
    }
    // слушатель на `document`, а не на контейнере: `Tab`, ушедший из диалога, на контейнере уже
    // не наблюдается — у такого keydown нет общего с диалогом родителя
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  return (
    <div className="state" role="dialog" aria-modal="true" aria-labelledby={labelId}>
      <h2 id={labelId}>{title}</h2>
      <p>{body}</p>
      <div className="app-header">
        <button type="button" className="btn btn-ghost" ref={cancel} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="btn" ref={confirm} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
