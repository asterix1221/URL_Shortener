import { useEffect, useSyncExternalStore } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { dismissToast, readToasts, subscribeToasts } from '../lib/toast';

const TOAST_TTL_MS = 4000;

// Живой регион и список — два узла: у элемента ровно одна роль, а `.toasts` в base.css идёт с
// `list-style: none`, после чего WebKit снимает со списка группировку и роль `list` приходится
// возвращать явно. Поэтому `role="status"` на обёртке, а не на `<ul>`. Мутация (перенос роли на
// `<ul>`) тесты не ломала — RTL выводит роль `<li>` из самого элемента, — и ловит её ассерт
// `getByRole('list')` в Toasts.test.tsx. Один живой регион на все тосты нужен строгому
// e2e-локатору: иначе live-областей было бы столько же, сколько сообщений на экране.
// Разворачивается вместе с первым тостом: постоянный пустой live-регион отвечал бы на
// `findByRole('status')` раньше, чем в нём появляется текст, и добавлял бы вторую live-область
// там, где страница уже показывает баннер истёкшей сессии.
export function Toasts() {
  const { t } = useI18n();
  const items = useSyncExternalStore(subscribeToasts, readToasts);

  // Перевзводится на каждый снимок стора: подписка могла прийти во время монтирования или
  // размонтирования (`pushToast` вызывается вне React), и `deps=[items]` — единственный способ не
  // оставить такой тост висеть вечно после cleanup'а.
  useEffect(() => {
    const timers = items.map((item) => window.setTimeout(() => dismissToast(item.id), TOAST_TTL_MS));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div role="status">
      {/* `list-style: none` в base.css лишает список группировки в WebKit, поэтому роль `list`
          проставлена явно */}
      <ul className="toasts" role="list">
        {items.map((item) => (
          <li key={item.id} className={`toast toast--${item.kind}`}>
            <p>{t(item.key, item.vars)}</p>
            <button type="button" className="btn-ghost" onClick={() => dismissToast(item.id)}>
              {t('links.delete.cancel')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
