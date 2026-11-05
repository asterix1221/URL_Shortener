import { afterEach, describe, expect, it, vi } from 'vitest';
import { login, register } from './auth';

afterEach(() => { vi.restoreAllMocks(); });

describe('auth api', () => {
  it('register не ждёт тело 201', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 201 }));
    await expect(register('a@b.c', 'Passw0rd!')).resolves.toEqual({ ok: true, data: undefined });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/register');
  });

  it('login не подставляет токен', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"accessToken":"A","expiresIn":3600}', { status: 200 }));
    await expect(login('a@b.c', 'Passw0rd!'))
      .resolves.toEqual({ ok: true, data: { accessToken: 'A', expiresIn: 3600 } });
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});
