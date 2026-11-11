import { useI18n } from '../i18n/I18nProvider';

type Props = {
  page: number;
  pages: number;
  size: number;
  first: boolean;
  last: boolean;
  onChange: (page: number) => void;
  onSizeChange: (size: number) => void;
};

// Ровно четыре размера спеки (§5.2:153). Сервер принимает 1..100 (`LinkController`), но выбор в
// интерфейсе — этот список: числа не переводятся, поэтому ключей на опции в словарях нет.
const SIZES = [10, 20, 50, 100] as const;

// Пагинатор серверный: `page`/`pages`/`first`/`last` приходят из `Page<LinkResponse>` как есть,
// компонент только пересчитывает соседнюю страницу в `onChange` и отдаёт выбранный размер в
// `onSizeChange` — правки состояния страницы нет, оба значения живут в URL (`LinksPage`).
// `.app-header` — единственная горизонтальная раскладка в CSS проекта (строка с `gap` и переносом),
// новых классов задача не заводит: селект попадает под общее правило `input, select, textarea`.
export function Pager({ page, pages, size, first, last, onChange, onSizeChange }: Props) {
  const { t } = useI18n();
  // Навигация рендерится всегда: размер страницы обязан быть доступен и на одной странице, и на
  // пустом списке. Кнопки и счётчик — только при `pages > 1`: там `first` и `last` одновременно
  // истинны, обе кнопки заблокированы, а `aria-current` на счётчике не озвучивает ничего полезного.
  const paging = pages > 1;

  return (
    <nav className="app-header">
      {paging ? (
        <>
          <button type="button" className="btn btn-ghost" disabled={first} onClick={() => onChange(page - 1)}>
            {t('links.page.prev')}
          </button>
          {/* формат из цифр и косой черты: ключей «Страница {n}» в словарях нет, новых задача не
              заводит, а подпись размера теперь у селекта (`links.page.sizeLabel`) */}
          <span aria-current="page">
            {page + 1} / {pages}
          </span>
          <button type="button" className="btn btn-ghost" disabled={last} onClick={() => onChange(page + 1)}>
            {t('links.page.next')}
          </button>
        </>
      ) : null}
      {/* доступное имя — через `label`/`htmlFor`, а не дублем в `aria-label`: скринридер читает
          подпись один раз, и она же видна зрячему */}
      <label htmlFor="page-size">{t('links.page.sizeLabel')}</label>
      <select
        id="page-size"
        value={size}
        onChange={(event) => onSizeChange(Number(event.target.value))}
      >
        {SIZES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </nav>
  );
}
