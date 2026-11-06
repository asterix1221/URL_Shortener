import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLink, getStats } from '../api/links';
import type { ApiFailure, LinkResponse, LinkStats } from '../api/types';
import { useAuth } from '../auth/useAuth';
import { ClicksChart } from '../components/ClicksChart';
import { CopyButton } from '../components/CopyButton';
import { ErrorState } from '../components/ErrorState';
import { ReferrersTable } from '../components/ReferrersTable';
import { Spinner } from '../components/Spinner';
import { useI18n } from '../i18n/I18nProvider';
import { errorKeyFor } from '../lib/errorKeys';
import { formatCount } from '../lib/format';
import { useAsync } from '../lib/useAsync';

// Страница читает и карточку, и статистику: два независимых `useAsync` вместо одного
// `Promise.all` над парой запросов. Параллельность при этом та же — оба эффекта стартуют в одном
// коммите, — но `Promise.all` сцепил бы жизни двух панелей: кнопка `detail.refresh` обязана
// повторить только `/stats`, не дёргая карточку ссылку (тест «статистика догоняет»).
export default function LinkDetailPage() {
  const { t, lang } = useI18n();
  const { token, handleUnauthorized } = useAuth();
  // Маршрут `/links/:code` (таблица `App.tsx`, задача 13) без сегмента не матчится, поэтому `code`
  // здесь заведомо строка. `useParams` возвращает `Record<string, string | undefined>` и общий
  // параметр типа на результат не влияет, а `?? ''` добавил бы ветку, которую ни один тест
  // страницы не достигает (гейт — 75 % веток): сужение сделано приведением, а не фолбэком.
  const { code } = useParams() as { code: string };

  // Гард 401 — до показа ошибки и ровно одна строка в обработчике: подменённый токен обязан
  // выбросить на `/login?expired=1`, а не оставить карточку с баннером «нужно войти».
  const guard = useCallback(
    (failure: ApiFailure): ApiFailure => {
      if (failure.status === 401) handleUnauthorized();
      return failure;
    },
    [handleUnauthorized]
  );

  const { state: card } = useAsync<LinkResponse>(async () => {
    const outcome = await getLink(code, token ?? '');
    if (!outcome.ok) return { status: 'error', error: guard(outcome.error) };
    return { status: 'ready', data: outcome.data };
  }, [code, token, guard]);

  const { state: stats, run: refreshStats } = useAsync<LinkStats>(async () => {
    const outcome = await getStats(code, token ?? '');
    if (!outcome.ok) return { status: 'error', error: guard(outcome.error) };
    return { status: 'ready', data: outcome.data };
  }, [code, token, guard]);

  // Отказ карточки гасит и панель статистики: при `code`, которого у пользователя нет, оба запроса
  // лежат одинаково, а второй `role="alert"` на экране сломал бы строгий
  // `getByRole('alert')` (правило — один alert на экран, включая баннер 429).
  const cardFailed = card.status === 'error';

  // Фрагмент, а не `.page`: обёртку с `max-width` и padding держит `AppLayout`, а ритм колонки
  // задаёт `.page > main` — только для прямых детей `main`.
  return (
    <>
      <section className="state">
        <p>
          <Link to="/">{t('detail.back')}</Link>
        </p>
        {card.status === 'loading' ? (
          // `aria-busy`, а не `role="status"`: единственный `role="status"` на странице
          // принадлежит контейнеру тостов (`Toasts`)
          <div aria-busy="true">
            <Spinner />
          </div>
        ) : card.status === 'error' ? (
          <ErrorState message={t(errorKeyFor(card.error, 'link'))} />
        ) : (
          <dl>
            <dt>{t('detail.short')}</dt>
            <dd>
              <span title={card.data.shortUrl}>{card.data.shortUrl}</span>
              {/* копирование переиспользует `CopyButton`: имя кнопки — `links.copy` + код, его же
                  ищет сценарий `stats.spec.ts` */}
              <CopyButton shortUrl={card.data.shortUrl} code={card.data.code} />
            </dd>
            <dt>{t('detail.original')}</dt>
            {/* полный адрес остаётся в DOM и в `title`: в узком вьюпорте подпись обрезается */}
            <dd>
              <span title={card.data.originalUrl}>{card.data.originalUrl}</span>
            </dd>
          </dl>
        )}
      </section>

      <section className="state">
        {/* подпись про лаг статистики постоянная: она объясняет расхождение «переход уже был,
            а счётчик ещё нет» в тот момент, когда цифра под запросом уже нарисована */}
        <p>{t('detail.hint.lag')}</p>
        {/* `disabled` на время запроса: эндпоинт статистики закрыт лимитом запросов, поэтому два
            клика подряд дали бы второй `GET /stats` и, возможно, 429-тост там, где пользователь
            просто дважды нажал «Обновить» */}
        <button
          type="button"
          className="btn-ghost"
          onClick={refreshStats}
          disabled={stats.status === 'loading'}
        >
          {t('detail.refresh')}
        </button>
        {stats.status === 'loading' ? (
          <div aria-busy="true">
            <Spinner />
          </div>
        ) : stats.status === 'error' ? (
          cardFailed ? null : (
            // без `retry`: кнопка `detail.refresh` над этой веткой делает ровно то же самое,
            // а вторая «Обновить» в дереве читалась бы как два разных действия
            <ErrorState message={t(errorKeyFor(stats.error, 'link'))} />
          )
        ) : (
          <>
            {/* метка и число в одном `h2`: отдельное `<p>`-подпись слева от заголовка давала
                безымянный в текстовом смысле заголовок («1 234»), который скринридер объявлял без
                слова «Переходов», а `h3` графика висел под ним сиротой. `dl` вместо этого не
                подходит: в `base.css` размера шрифта нет ни у `dl`, ни у `dd` (единственный
                `font-size` в файле принадлежит `.badge`), а план требует именно крупную цифру —
                механизм «крупно» в этом проекте и есть заголовок по умолчанию.
                `data-metric` — точка ожидания `stats.spec.ts`: сам `span` остаётся одним числом,
                поэтому атрибут не зависит от локализованного текста вокруг него */}
            <h2>
              {t('detail.total')}:{' '}
              <span data-metric="total-clicks">{formatCount(stats.data.totalClicks, lang)}</span>
            </h2>
            <ClicksChart byDay={stats.data.byDay} lang={lang} />
            <ReferrersTable referrers={stats.data.topReferrers} />
          </>
        )}
      </section>
    </>
  );
}
