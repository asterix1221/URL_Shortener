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
const BAR_GAP = 6;
// Запас слева под подписи тиков и снизу — под подписи дней: `svg` без вёрстки не «дышит», а
// отдельного CSS-класса под поле графика нет и добавлять его запрещено (`base.css` правкам не подлежит).
const AXIS_LEFT = 32;
const LABELS_BOTTOM = 14;

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
  const height = AREA_HEIGHT + LABELS_BOTTOM;

  return (
    // `role="img"` с `aria-labelledby` на `<title>`: дней со столбцами у графика нет ни в таблице
    // источников, ни в крупном счётчике, поэтому без подписанной роли скринридер не узнал бы
    // о гистограмме ничего
    <svg role="img" aria-labelledby={titleId} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <title id={titleId}>{heading}</title>
      {/* `fill`/`stroke` презентационными атрибутами, а не классом: `currentColor` переживает и
          светлую, и тёмную тему, а стилей для графика в проекте нет */}
      <line x1={AXIS_LEFT} y1={0} x2={AXIS_LEFT} y2={AREA_HEIGHT} stroke="currentColor" />
      <line x1={AXIS_LEFT} y1={AREA_HEIGHT} x2={width} y2={AREA_HEIGHT} stroke="currentColor" />
      {scale.ticks.map((tick) => (
        <text
          key={tick}
          x={AXIS_LEFT - 4}
          y={AREA_HEIGHT - barHeight(tick, scale.max, AREA_HEIGHT) + 3}
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
            y={AREA_HEIGHT - column}
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
          y={AREA_HEIGHT + 10}
          fontSize="9"
          textAnchor="middle"
          fill="currentColor"
        >
          {formatDay(day.date, lang)}
        </text>
      ))}
    </svg>
  );
}
