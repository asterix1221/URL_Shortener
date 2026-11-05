import type { Lang } from './i18n';

// `timeZone: 'UTC'` обязателен в обоих форматах и для обеих локалей (рулинг 7-B): без него одно
// и то же мгновенение показывалось бы «18:30» в EN и «13:30» в RU на машине из New York, а
// `formatDay` сдвигал бы клик на предыдущий день прямо под подписью «По дням (UTC)». День
// считается на сервере в UTC (`ClickEventRepository.java:29` — `date_trunc('day', clicked_at
// AT TIME ZONE 'UTC')`), поэтому пин делает подпись честной и тест — независимым от зоны машины.
export function formatDateTime(iso: string | null, lang: Lang): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB',
    { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(iso));
}

export const formatCount = (value: number, lang: Lang) =>
  new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-GB').format(value);

export const formatDay = (day: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${day}T00:00:00Z`));
