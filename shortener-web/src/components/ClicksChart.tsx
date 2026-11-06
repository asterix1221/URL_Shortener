import { useId } from 'react';
import type { DailyClicks } from '../api/types';
import { barHeight, buildScale } from '../lib/chart';
import { formatCount, formatDay } from '../lib/format';
import { t, type Lang } from '../lib/i18n';
import { EmptyState } from './EmptyState';

type Props = { byDay: DailyClicks[]; lang: Lang };

// Высота области столбцов в пикселях. Она же — знаменатель пропорции в `barHeight`: при шкале 6
// (upper tick для `max = 5`) столбец на 5 кликов выходит 25, то есть ровно под верхний тик.
// Масштаб по сырому максимуму данных дал бы 30 из 30 и вершину столбца выше всей оси.
const AREA_HEIGHT = 30;
const BAR_WIDTH = 14;
// Шаг столбца (= `BAR_WIDTH + BAR_GAP`) обязан быть не уже подписи дня: `formatDay` для `ru`
// даёт «03 нояб.» — 8 знаков по 9 px, примерно 36 px, для `en` — «03 Nov» (~28 px). При шаге 20
// метки залезали бы друг на друга уже на двух днях, поэтому запас между столбцами выбран по
// самой широкой локали, а не по вкусу.
const BAR_GAP = 26;
// Запас слева под подписи тиков и снизу — под подписи дней: `svg` без вёрстки не «дышит», а
// отдельного CSS-класса под поле графика нет и добавлять его запрещено (`base.css` правкам не подлежит).
const AXIS_LEFT = 32;
const LABELS_BOTTOM = 14;
// Верхний отступ: подпись самого верхнего тика ставится с `textAnchor="end"` и `fontSize="9"` на
// `y = AREA_HEIGHT - barHeight(tick, …) + 3`, то есть при `tick = max` на `y = 3`. Знаки уходят
// выше нуля, а `svg` обрезает собственным вьюпортом — верхнее деление оси исчезало бы на глаз.
const TOP_PAD = 6;

// Компонент живёт на `lang`-пропсе и чистом `t` из `src/lib/i18n`, а не на `useI18n`: у него есть
// модульный тест без провайдеров, и график не читает ни сеанс, ни навигацию.
export function ClicksChart({ byDay, lang }: Props) {
  const titleId = useId();
  const heading = t(lang, 'detail.byDay');
  if (byDay.length === 0) {
    return (
      <EmptyState>
        <h3>{heading}</h3>
      </EmptyState>
    );
  }

  const scale = buildScale(byDay);
  const plotWidth = byDay.length * (BAR_WIDTH + BAR_GAP) + BAR_GAP;
  const width = AXIS_LEFT + plotWidth;
  const height = TOP_PAD + AREA_HEIGHT + LABELS_BOTTOM;

  return (
    <>
      {/* заголовок видимый, а не `<title>` внутри `svg`: подпись «По дням (UTC)» обязан читать и
          пользователь, и скринридер, а `aria-labelledby` ссылается на этот же узел по `id`, чтобы
          имя не пришлось дублировать вторым экземпляром текста */}
      <h3 id={titleId}>{heading}</h3>
      {/* `role="img"`: у столбцов по дням на этой странице нет текстового эквивалента
          (`ReferrersTable` покрывает источники, а не дни), поэтому без подписанной роли график
          просто исчезал бы из дерева доступных имён */}
      <svg
        role="img"
        aria-labelledby={titleId}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        /* `width`/`height` + равный им `viewBox` сами по себе масштаб не дают: фигура рисуется в
            пикселях и при длинном `byDay` (сервер не ограничивает число дней) вылезла бы за
            `.state`. `maxWidth` с `height: auto` оставляют пропорции вьюбокса, поэтому длинный
            ряд сжимается по ширине панели, а не ломает вёрстку; шаг 40 px выбран ровно для того,
            чтобы типовые ряды в 2–20 дней сжались не требовалось */
        style={{ maxWidth: '100%', height: 'auto' }}
      >
        {/* `fill`/`stroke` презентационными атрибутами, а не классом: `currentColor` переживает и
            светлую, и тёмную тему, а стилей для графика в проекте нет */}
        <line x1={AXIS_LEFT} y1={TOP_PAD} x2={AXIS_LEFT} y2={TOP_PAD + AREA_HEIGHT} stroke="currentColor" />
        <line
          x1={AXIS_LEFT}
          y1={TOP_PAD + AREA_HEIGHT}
          x2={width}
          y2={TOP_PAD + AREA_HEIGHT}
          stroke="currentColor"
        />
        {scale.ticks.map((tick) => (
          <text
            key={tick}
            x={AXIS_LEFT - 4}
            y={TOP_PAD + AREA_HEIGHT - barHeight(tick, scale.max, AREA_HEIGHT) + 3}
            fontSize="9"
            textAnchor="end"
            fill="currentColor"
          >
            {formatCount(tick, lang)}
          </text>
        ))}
        {byDay.map((day, index) => {
          const column = barHeight(day.count, scale.max, AREA_HEIGHT);
          return (
            <rect
              key={day.date}
              className="bar"
              x={AXIS_LEFT + BAR_GAP + index * (BAR_WIDTH + BAR_GAP)}
              y={TOP_PAD + AREA_HEIGHT - column}
              width={BAR_WIDTH}
              height={column}
              fill="currentColor"
            />
          );
        })}
        {byDay.map((day, index) => (
          <text
            key={day.date}
            x={AXIS_LEFT + BAR_GAP + index * (BAR_WIDTH + BAR_GAP) + BAR_WIDTH / 2}
            y={TOP_PAD + AREA_HEIGHT + 10}
            fontSize="9"
            textAnchor="middle"
            fill="currentColor"
          >
            {formatDay(day.date, lang)}
          </text>
        ))}
      </svg>
    </>
  );
}
