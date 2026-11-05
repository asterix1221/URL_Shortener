import type { DailyClicks } from '../api/types';

// Вся математика гистограммы отдельно от JSX (иначе 100 % строк на `src/lib` недостижим).
// Пустой набор и набор из нулей дают шкалу 1, чтобы `barHeight` никогда не делил на ноль.
export function buildScale(byDay: DailyClicks[]): { max: number; ticks: number[] } {
  const max = byDay.reduce((acc, day) => Math.max(acc, day.count), 0);
  if (max === 0) return { max: 1, ticks: [0, 1] };
  const step = Math.max(1, Math.ceil(max / 4));
  const ticks: number[] = [];
  for (let value = 0; value <= max + step; value += step) ticks.push(value);
  return { max: ticks[ticks.length - 1], ticks };
}

export function barHeight(count: number, scaleMax: number, areaHeight: number): number {
  if (scaleMax <= 0) return 0;
  return Math.round((count / scaleMax) * areaHeight);
}
