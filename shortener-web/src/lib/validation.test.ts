import { describe, expect, it } from 'vitest';
import { toIsoInstant, validateCredentials, validateLinkForm } from './validation';

describe('validateLinkForm', () => {
  // Без Z: обе даты читаются в одной и той же локальной зоне, и сравнение не зависит от
  // часового пояса машины. С '…T12:00:00Z' тест падает на любой зоне к западу от UTC,
  // потому что '2026-11-04T11:59' без суффикса — локальное время, а now — зулус.
  const now = new Date('2026-11-04T12:00:00');
  const base = { url: 'https://e.com', alias: '', expiresAt: '', maxClicks: '' };

  it('требует url и режет его по 2048', () => {
    expect(validateLinkForm({ ...base, url: '' }, now).url).toBe('errors.required');
    expect(validateLinkForm({ ...base, url: 'x'.repeat(2049) }, now).url).toBe('errors.urlLong');
    expect(validateLinkForm(base, now)).toEqual({});
  });
  it('alias: формат и резерв', () => {
    expect(validateLinkForm({ ...base, alias: 'ab' }, now).alias).toBe('errors.aliasFormat');
    expect(validateLinkForm({ ...base, alias: 'a!c' }, now).alias).toBe('errors.aliasFormat');
    expect(validateLinkForm({ ...base, alias: 'APP' }, now).alias).toBe('errors.aliasReserved');
    expect(validateLinkForm({ ...base, alias: 'app' }, now).alias).toBe('errors.aliasReserved');
    expect(validateLinkForm({ ...base, alias: 'assets' }, now).alias).toBe('errors.aliasReserved');
    expect(validateLinkForm({ ...base, alias: 'api' }, now).alias).toBe('errors.aliasReserved');
    expect(validateLinkForm({ ...base, alias: 'ok_code-1' }, now).alias).toBeUndefined();
  });
  it('expiresAt обязан быть в будущем и разбираться', () => {
    expect(validateLinkForm({ ...base, expiresAt: '2026-11-04T11:59' }, now).expiresAt)
      .toBe('errors.expiresPast');
    expect(validateLinkForm({ ...base, expiresAt: 'not-a-date' }, now).expiresAt)
      .toBe('errors.expiresPast');
    expect(validateLinkForm({ ...base, expiresAt: '2026-11-05T00:00' }, now).expiresAt).toBeUndefined();
  });
  it('maxClicks — целое не меньше 1', () => {
    expect(validateLinkForm({ ...base, maxClicks: '0' }, now).maxClicks).toBe('errors.clicksMin');
    expect(validateLinkForm({ ...base, maxClicks: '-2' }, now).maxClicks).toBe('errors.clicksMin');
    expect(validateLinkForm({ ...base, maxClicks: '1.5' }, now).maxClicks).toBe('errors.clicksInteger');
    expect(validateLinkForm({ ...base, maxClicks: '7' }, now).maxClicks).toBeUndefined();
  });
});

describe('validateCredentials', () => {
  it('email: обязателен, разбирается и не длиннее 254', () => {
    expect(validateCredentials({ email: '', password: 'Passw0rd!' }).email).toBe('errors.required');
    expect(validateCredentials({ email: 'nope', password: 'Passw0rd!' }).email).toBe('errors.email');
    expect(validateCredentials({ email: `x${'y'.repeat(250)}@z.c`, password: 'Passw0rd!' }).email)
      .toBe('errors.email');
    expect(validateCredentials({ email: ' a@b.co ', password: 'Passw0rd!' }).email).toBeUndefined();
  });
  it('password: 8–72, пустой нельзя', () => {
    expect(validateCredentials({ email: 'a@b.co', password: '' }).password).toBe('errors.required');
    expect(validateCredentials({ email: 'a@b.co', password: 'short' }).password).toBe('errors.password');
    expect(validateCredentials({ email: 'a@b.co', password: 'x'.repeat(73) }).password).toBe('errors.password');
    expect(validateCredentials({ email: 'a@b.co', password: 'Passw0rd!' })).toEqual({});
  });
});

describe('toIsoInstant', () => {
  it('пустое и неразобранное — null, остальное — UTC-мгновение', () => {
    expect(toIsoInstant('')).toBeNull();
    expect(toIsoInstant('кофе')).toBeNull();
    expect(toIsoInstant('2026-11-05T00:00')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
