import { describe, expect, it } from 'vitest';
import { formatCount, formatDateTime, formatDay } from './format';

/**
 * Ожидаемые строки — литералы с фиксированной датой, поэтому пино `timeZone: 'UTC'` видно в
 * ассертах: без него результат зависел бы от зоны машины (в America/New_York — «13:30» и
 * «31 окт.», здесь — «21:30»). Разделители тысяч в `ru` пишутся как `\u00A0`: это ровно тот
 * неразрывный пробел, который отдаёт CLDR, только в escape-форме, не теряющейся при правках.
 */
describe('formatDateTime', () => {
  it('один и тот же момент в UTC для обеих локалей', () => {
    expect(formatDateTime('2026-11-04T18:30:00Z', 'ru')).toBe('4 нояб. 2026 г., 18:30');
    expect(formatDateTime('2026-11-04T18:30:00Z', 'en')).toBe('4 Nov 2026, 18:30');
  });
  it('null — пустая строка, а не Invalid Date', () => {
    expect(formatDateTime(null, 'ru')).toBe('');
    expect(formatDateTime(null, 'en')).toBe('');
  });
});

describe('formatDay', () => {
  it('календарный день из UTC, без сдвига на зону машины', () => {
    expect(formatDay('2026-11-01', 'ru')).toBe('01 нояб.');
    expect(formatDay('2026-11-01', 'en')).toBe('01 Nov');
  });
});

describe('formatCount', () => {
  it('разделители тысяч по локали', () => {
    expect(formatCount(1234567, 'ru')).toBe('1\u00A0234\u00A0567');
    expect(formatCount(1234567, 'en')).toBe('1,234,567');
  });
});
