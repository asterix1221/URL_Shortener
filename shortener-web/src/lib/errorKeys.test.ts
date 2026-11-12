import { describe, expect, it } from 'vitest';
import type { ApiFailure } from '../api/types';
import { errorKeyFor } from './errorKeys';

const failure = (status: number, message = ''): ApiFailure => ({ status, message, retryAfterSeconds: null });

describe('errorKeyFor', () => {
  it('400 — отклонённые данные на обоих экранах', () => {
    expect(errorKeyFor(failure(400, 'url: must not be blank'), 'link')).toBe('errors.invalid');
    expect(errorKeyFor(failure(400, 'email: must not be blank'), 'auth')).toBe('errors.invalid');
  });
  it('401 на входе — про неверные данные', () => {
    expect(errorKeyFor(failure(401), 'auth')).toBe('errors.credentials');
  });
  it('401 на экране ссылок — про истёкшую сессию', () => {
    expect(errorKeyFor(failure(401), 'link')).toBe('auth.session.expired');
  });
  it('403 — ссылка не найдена или не ваша', () => {
    expect(errorKeyFor(failure(403), 'link')).toBe('errors.notFound');
  });
  it('404 — тот же текст, что и 403', () => {
    expect(errorKeyFor(failure(404), 'link')).toBe('errors.notFound');
  });
  it('409 на экране ссылок — занят код', () => {
    expect(errorKeyFor(failure(409, 'alias already taken: app'), 'link')).toBe('errors.aliasTaken');
  });
  it('409 на входе — занята почта', () => {
    expect(errorKeyFor(failure(409, 'user exists'), 'auth')).toBe('errors.emailTaken');
  });
  it('429 — лимит создания ссылок', () => {
    expect(errorKeyFor(failure(429), 'link')).toBe('errors.rateLimit');
  });
  it('500 — сервис недоступен', () => {
    expect(errorKeyFor(failure(500), 'link')).toBe('errors.server');
  });
  it('502 — тоже ветка >= 500', () => {
    expect(errorKeyFor(failure(502), 'auth')).toBe('errors.server');
  });
  it('status 0 с timeout — отдельные текст', () => {
    expect(errorKeyFor(failure(0, 'timeout'), 'link')).toBe('errors.timeout');
  });
  it('status 0 без timeout — нет связи', () => {
    expect(errorKeyFor(failure(0, 'network error'), 'auth')).toBe('errors.network');
  });
});
