import { describe, expect, it } from 'vitest';
import type { DailyClicks } from '../api/types';
import { barHeight, buildScale } from './chart';

const day = (date: string, count: number): DailyClicks => ({ date, count });

describe('buildScale', () => {
  it('пустой набор — минимальная шкала, деление на ноль исключено', () => {
    expect(buildScale([])).toEqual({ max: 1, ticks: [0, 1] });
  });
  it('дни с нулём кликов — та же минимальная шкала', () => {
    expect(buildScale([day('2026-11-01', 0), day('2026-11-02', 0)])).toEqual({ max: 1, ticks: [0, 1] });
  });
  it('7 кликов — шаг 2 и тики [0..8]', () => {
    expect(buildScale([day('2026-11-01', 7)])).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] });
  });
  it('шаг считается по максимуму набора, а не по последнему дню', () => {
    expect(buildScale([day('2026-11-01', 2), day('2026-11-02', 3), day('2026-11-03', 1)]))
      .toEqual({ max: 4, ticks: [0, 1, 2, 3, 4] });
  });
  it('один клик — шаг остаётся целым и не дробным', () => {
    expect(buildScale([day('2026-11-01', 1)])).toEqual({ max: 2, ticks: [0, 1, 2] });
  });
});

describe('barHeight', () => {
  it('доля от области с округлением до пикселя', () => {
    expect(barHeight(5, 10, 100)).toBe(50);
    expect(barHeight(1, 3, 100)).toBe(33);
    expect(barHeight(0, 8, 100)).toBe(0);
  });
  it('нула или отрицательная шкала — ноль, а не Infinity и не NaN', () => {
    expect(barHeight(7, 0, 100)).toBe(0);
    expect(barHeight(7, -2, 100)).toBe(0);
  });
});
