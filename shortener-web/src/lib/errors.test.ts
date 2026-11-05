import { describe, expect, it } from 'vitest';
import { retryAfterSeconds, serverErrorField, splitServerMessage } from './errors';

describe('splitServerMessage', () => {
  it('префикс до двоеточия — имя поля', () => {
    expect(splitServerMessage('alias: reserved word app')).toEqual({ field: 'alias', text: 'reserved word app' });
    expect(splitServerMessage('too many link creations')).toEqual({ field: null, text: 'too many link creations' });
    expect(splitServerMessage('a: b: c')).toEqual({ field: 'a', text: 'b: c' });
  });
});

describe('serverErrorField', () => {
  it('известное поле возвращается, неизвестное — null', () => {
    expect(serverErrorField('url: must not be blank')).toBe('url');
    expect(serverErrorField('alias: reserved word app')).toBe('alias');
    expect(serverErrorField('unknown: x')).toBeNull();
    expect(serverErrorField('a: b: c')).toBeNull();
    expect(serverErrorField('too many link creations')).toBeNull();
  });
});

describe('retryAfterSeconds', () => {
  it('Retry-After используется как отсчёт, при его отсутствии — ноль', () => {
    expect(retryAfterSeconds({ status: 429, message: 'x', retryAfterSeconds: 17 })).toBe(17);
    expect(retryAfterSeconds({ status: 429, message: 'x', retryAfterSeconds: null })).toBe(0);
    expect(retryAfterSeconds({ status: 429, message: 'x', retryAfterSeconds: -5 })).toBe(0);
  });
});
