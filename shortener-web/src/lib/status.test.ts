import { describe, expect, it } from 'vitest';
import { statusOf } from './status';

const NOW = new Date('2026-11-05T00:00:00Z');

describe('statusOf', () => {
  // Кейс `'не дата'` обязателен, а не декоративен: `new Date('не дата')` даёт `NaN`, любое
  // сравнение с `NaN` — `false`, поэтому неразобранное значение из ответа сервера не должно
  // превращать живую ссылку в «истекла». Ветки этим кейсом не расширяются.
  it('бейдж: удалённая важнее истёкшей', () => {
    expect(statusOf({ active: false, expiresAt: null }, NOW)).toBe('status.inactive');
    expect(statusOf({ active: false, expiresAt: '2020-01-01T00:00:00Z' }, NOW)).toBe('status.inactive');
    expect(statusOf({ active: true, expiresAt: '2020-01-01T00:00:00Z' }, NOW)).toBe('status.expired');
    expect(statusOf({ active: true, expiresAt: '2030-01-01T00:00:00Z' }, NOW)).toBe('status.active');
    expect(statusOf({ active: true, expiresAt: null }, NOW)).toBe('status.active');
    expect(statusOf({ active: true, expiresAt: 'не дата' }, NOW)).toBe('status.active');
  });
});
