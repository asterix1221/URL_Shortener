import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLink, deleteLink, getLink, getStats, listLinks } from './links';

afterEach(() => { vi.restoreAllMocks(); });

describe('links api', () => {
  it('собирает страницу со смещением и размером', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"content":[]}', { status: 200 }));
    await listLinks(2, 50, 'JWT');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/links?page=2&size=50');
  });

  it('stats кодирует пробел в коде и добавляет /stats', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await getStats('a b', 'JWT');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/links/a%20b/stats');
  });

  it('createLink отправляет payload и токен', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"code":"abc"}', { status: 201 }));
    await expect(createLink({ url: 'https://example.com', alias: 'abc' }, 'JWT'))
      .resolves.toEqual({ ok: true, data: { code: 'abc' } });
    expect(fetchMock).toHaveBeenCalledWith('/api/links', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer JWT', 'Content-Type': 'application/json' },
      body: '{"url":"https://example.com","alias":"abc"}'
    }));
  });

  it('getLink — GET с токеном и без тела', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"code":"abc"}', { status: 200 }));
    await getLink('abc', 'JWT');
    expect(fetchMock).toHaveBeenCalledWith('/api/links/abc',
      expect.objectContaining({ headers: { Authorization: 'Bearer JWT' } }));
  });

  it('deleteLink кодирует код и ждёт 204', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteLink('a/b', 'JWT')).resolves.toEqual({ ok: true, data: undefined });
    expect(fetchMock).toHaveBeenCalledWith('/api/links/a%2Fb', expect.objectContaining({ method: 'DELETE' }));
  });
});
