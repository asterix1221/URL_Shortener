import { useEffect, useSyncExternalStore } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { dismissToast, readToasts, subscribeToasts } from '../lib/toast';

const TOAST_TTL_MS = 4000;

// Контейнер — единственный `role="status"` на все тосты (элементы списка ролей не имеют), иначе
// строгий locator e2e нашёл бы столько live-регионов, сколько сообщений на экране.
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
      {/* `role` на `<ul>` отнял бы у элементов списка их семантику (`listitem` требует родителя с
          ролью `list`), поэтому live-регион — обёртка, а список живёт внутри неё */}
      <ul className="toasts">
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
