import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LinkResponse } from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import type { Key } from '../lib/i18n';
import { formatCount, formatDateTime } from '../lib/format';
import { CopyButton } from './CopyButton';
import { StatusBadge } from './StatusBadge';

type Props = {
  links: LinkResponse[];
  onRequestDelete: (link: LinkResponse) => void;
};

// Колонки одним массивом: из `key` берётся и `t(key)` для `<th>`, и `t(key)` для `data-label`
// ячейки. Два раздельных списка разъехались бы при первой же правке копий, а ниже 900px это
// потеря подписей вообще: `base.css:276` прячет `thead`, и `content: attr(data-label)` (`:295`)
// остаётся единственным, чем можно отличить значение в карточке.
export function LinksTable({ links, onRequestDelete }: Props) {
  const { t, lang } = useI18n();
  const now = new Date();
  const columns: readonly { key: Key; render: (link: LinkResponse) => ReactNode }[] = [
    {
      key: 'links.table.code',
      // единственная ссылка строки и её имя — ровно код: e2e задачи 15 ищет
      // `getByRole('link', { name: code, exact: true })`, вторая ссылка с кодом в имени
      // (короткий URL) включила бы strict mode на четырёх сценариях. По `data-short-url` тот же
      // e2e сверяет буфер обмена, не угадывая адрес.
      render: (link) => (
        <Link to={`/links/${link.code}`} data-short-url={link.shortUrl}>
          {link.code}
        </Link>
      )
    },
    {
      key: 'links.table.target',
      render: (link) => (
        <>
          <span>{link.shortUrl}</span>
          <CopyButton shortUrl={link.shortUrl} code={link.code} />
        </>
      )
    },
    {
      // `title` держит полный адрес: ячейка в узком вьюпорте обрезается, а `originalUrl` в DOM
      // остаётся тем значением, которое сравнивает e2e
      key: 'links.field.url',
      render: (link) => <span title={link.originalUrl}>{link.originalUrl}</span>
    },
    { key: 'links.table.created', render: (link) => <span>{formatDateTime(link.createdAt, lang)}</span> },
    {
      key: 'links.table.expires',
      render: (link) => <span>{link.expiresAt === null ? t('links.never') : formatDateTime(link.expiresAt, lang)}</span>
    },
    {
      // пустой лимит — тире, а не ноль: `0` читалось бы как «переходов разрешено ноль»
      key: 'links.table.limit',
      render: (link) => <span>{link.maxClicks === null ? '—' : formatCount(link.maxClicks, lang)}</span>
    },
    { key: 'links.table.status', render: (link) => <StatusBadge link={link} now={now} /> },
    {
      key: 'links.table.actions',
      render: (link) => (
        <button type="button" className="btn-ghost" onClick={() => onRequestDelete(link)}>
          {`${t('links.delete')} ${link.code}`}
        </button>
      )
    }
  ];

  return (
    <table className="table-grid">
      {/* подпись скрыта CSS (`.table-grid caption`), но остаётся в дереве доступных имён таблицы */}
      <caption>{t('nav.links')}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col">
              {t(column.key)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {links.map((link) => (
          <tr key={link.code}>
            {columns.map((column) => (
              <td key={column.key} data-label={t(column.key)}>
                {column.render(link)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
