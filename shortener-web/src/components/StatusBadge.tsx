import { useI18n } from '../i18n/I18nProvider';
import type { LinkResponse } from '../api/types';
import { statusOf } from '../lib/status';

// Ключ статуса — `Key` (весь словарь), поэтому тон подбирается сравнением, а не словарём-объектом:
// `Record<Key, string>` ради трёх строк переписал бы все восемьдесят ключей, а индексация
// `TONE[key]` с сужением требовал бы каста. Ветки здесь ровно три — по числу статусов в словаре.
export function StatusBadge({
  link,
  now
}: {
  link: Pick<LinkResponse, 'active' | 'expiresAt'>;
  now: Date;
}) {
  const { t } = useI18n();
  const key = statusOf(link, now);
  const tone =
    key === 'status.inactive' ? 'badge--inactive' : key === 'status.expired' ? 'badge--expired' : 'badge--active';
  return <span className={`badge ${tone}`}>{t(key)}</span>;
}
