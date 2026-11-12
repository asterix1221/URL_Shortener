import { useRef } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { pushToast } from '../lib/toast';

type Props = { shortUrl: string; code: string };

// Доступное имя — `links.copy` + код (рулинг 11-I): это единственный компонент копирования в
// проекте, карточка ссылки (задача 12) переиспользует его, а e2e задачи 15 ищет кнопку целиком.
export function CopyButton({ shortUrl, code }: Props) {
  const { t } = useI18n();
  const area = useRef<HTMLTextAreaElement | null>(null);
  // `Clipboard API` живёт только в защищённом контексте, а Jenkins старует через
  // `http://host.docker.internal:28180` — там он недоступен по определению. Без второй ветки
  // копирование молча ломалось бы в прогоне.
  const viaClipboard = window.isSecureContext && navigator.clipboard !== undefined;

  async function copy(): Promise<void> {
    if (viaClipboard) {
      await navigator.clipboard.writeText(shortUrl);
    } else {
      // `select()` перед `execCommand('copy')`: копируется текущий диапазон, а не значение поля.
      // Продуктовый код не проверяет наличие `execCommand` через `typeof` — в браузере он есть
      // всегда, а защитная ветка стала бы второй непокрываемой (рулинг 9-A).
      area.current?.select();
      document.execCommand('copy');
    }
    pushToast('ok', 'links.copied');
  }

  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => void copy()}>
        {`${t('links.copy')} ${code}`}
      </button>
      {viaClipboard ? null : (
        // Поле обязано остаться в DOM после клика: в незащищённом контексте `execCommand` ничего
        // не возвращает, и значение в этом textarea — единственный признак того, что копирование
        // вообще произошло (его и читает `auth.spec.ts` из задачи 15). Прятать его `hidden` или
        // `display: none` нельзя: в Chromium у скрытого элемента `select()` не задаёт диапазон,
        // поэтому смещение за границу вьюпорта + `opacity` (элемент остаётся в дереве
        // доступности и озвучивает скопированное значение), а `tabIndex={-1}` убирает его из
        // порядка обхода.
        <textarea
          ref={area}
          data-copy-fallback
          value={shortUrl}
          readOnly
          tabIndex={-1}
          style={{ position: 'fixed', top: 0, left: '-40px', width: '32px', height: '32px', opacity: 0 }}
        />
      )}
    </>
  );
}
