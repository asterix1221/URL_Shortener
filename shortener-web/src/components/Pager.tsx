import { useI18n } from '../i18n/I18nProvider';

type Props = {
  page: number;
  pages: number;
  size: number;
  first: boolean;
  last: boolean;
  onChange: (page: number) => void;
};

// Пагинатор серверный: `page`/`pages`/`first`/`last` приходят из `Page<LinkResponse>` как есть,
// компонент только пересчитывает соседнюю страницу в `onChange` — правки состояния страницы нет.
// `.app-header` — единственная горизонтальная раскладка в CSS проекта (строка с `gap` и переносом),
// новых классов задача не заводит.
export function Pager({ page, pages, size, first, last, onChange }: Props) {
  const { t } = useI18n();
  // При одной странице (и при пустом списке) кнопки бессмысленны: `first` и `last` одновременно
  // истинны, обе заблокированы, а `aria-current` на счётчике не озвучивает ничего полезного.
  if (pages <= 1) return null;

  return (
    <nav className="app-header">
      <button type="button" className="btn btn-ghost" disabled={first} onClick={() => onChange(page - 1)}>
        {t('links.page.prev')}
      </button>
      {/* формат из цифр и косой черты: ключей «Страница {n}» в словарях нет, новых задача не заводит,
          а `links.page.size` («Страница по {size}») описывает размер страницы, а не её номер */}
      <span aria-current="page">
        {page + 1} / {pages}
      </span>
      <span>{t('links.page.size', { size })}</span>
      <button type="button" className="btn btn-ghost" disabled={last} onClick={() => onChange(page + 1)}>
        {t('links.page.next')}
      </button>
    </nav>
  );
}
