import type { ReferrerClicks } from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import { formatCount } from '../lib/format';
import { EmptyState } from './EmptyState';

// Источников у сервера ровно два значения: адрес `Referer` или пустая строка, когда заголовка не
// было (`ClickEventRepository.java` группирует по пустому значению). Пустая строка — это прямой
// переход, а не пустая ячейка, поэтому подпись берётся из `detail.direct`, а не из данных.
export function ReferrersTable({ referrers }: { referrers: ReferrerClicks[] }) {
  const { t, lang } = useI18n();

  if (referrers.length === 0) {
    return (
      <EmptyState>
        <h3>{t('detail.referrers')}</h3>
      </EmptyState>
    );
  }

  return (
    <table className="table-grid">
      {/* подпись скрыта CSS (`.table-grid caption`), но даёт таблице имя в дереве доступных имён;
          первая колонка повторяет то же слово — нового ключа задача 7 не заводит, паритет-тест
          краснеет на асимметрии словарей */}
      <caption>{t('detail.referrers')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('detail.referrers')}</th>
          <th scope="col">{t('detail.total')}</th>
        </tr>
      </thead>
      <tbody>
        {referrers.map((row) => (
          <tr key={row.referrer}>
            <td data-label={t('detail.referrers')}>{row.referrer === '' ? t('detail.direct') : row.referrer}</td>
            <td data-label={t('detail.total')}>{formatCount(row.count, lang)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
