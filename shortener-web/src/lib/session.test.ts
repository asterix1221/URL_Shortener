import { beforeEach, describe, expect, it } from 'vitest';
import { clearToken, loadToken, saveToken } from './session';

describe('session', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('без сохранённого ключа loadToken даёт null, а не пустую строку', () => {
    expect(loadToken()).toBeNull();
  });

  it('saveToken кладёт токен под shortener.token, clearToken убирает его', () => {
    saveToken('T');
    expect(sessionStorage.getItem('shortener.token')).toBe('T');
    expect(loadToken()).toBe('T');
    clearToken();
    expect(loadToken()).toBeNull();
  });
});
