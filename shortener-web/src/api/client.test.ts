import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from './client';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers })
  );

// useRealTimers здесь, а не в конце кейса с таймерами: если тот упадёт до своей
// отмены, фейковые таймеры утекут во все последующие кейсы файла, и их провал
// уже ничего не объяснит.
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('request', () => {
  it('возвращает разобранный JSON при 201', async () => {
    const fetchMock = json(201, { code: 'abc', shortUrl: 'http://h/abc' });
    await expect(request<{ code: string }>({ path: '/api/links', method: 'POST', body: { url: 'https://e' } }))
      .resolves.toEqual({ ok: true, data: { code: 'abc', shortUrl: 'http://h/abc' } });
    expect(fetchMock).toHaveBeenCalledWith('/api/links', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"url":"https://e"}'
    }));
  });

  it('204 отдаёт undefined без попытки разобрать JSON', async () => {
    json(204, null);
    await expect(request<void>({ path: '/api/links/abc', method: 'DELETE', token: 't' }))
      .resolves.toEqual({ ok: true, data: undefined });
  });

  it('2xx с пустым телом — undefined, до JSON.parse дело не доходит', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 201 }));
    await expect(request<void>({ path: '/api/auth/register', method: 'POST' }))
      .resolves.toEqual({ ok: true, data: undefined });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('сообщение и Retry-After приходят из ошибки', async () => {
    json(429, { status: 429, message: 'too many link creations' }, { 'Retry-After': '17' });
    const r = await request({ path: '/api/links', method: 'POST' });
    expect(r).toEqual({ ok: false, error: { status: 429, message: 'too many link creations', retryAfterSeconds: 17 } });
  });

  it('нестандартный ответ (HTML от nginx) не роняет парсер', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    const r = await request({ path: '/api/links' });
    expect(r).toEqual({ ok: false, error: { status: 502, message: 'service unavailable', retryAfterSeconds: null } });
  });

  it('2xx с не-JSON телом — status ответа и unexpected response, а не status 0', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>SPA</html>', { status: 200 }));
    await expect(request({ path: '/api/links' })).resolves.toEqual({
      ok: false, error: { status: 200, message: 'unexpected response', retryAfterSeconds: null }
    });
  });

  it('JSON ошибки без message не уходит в интерфейс сырым телом', async () => {
    json(400, { status: 400, error: 'BAD_REQUEST' });
    await expect(request({ path: '/api/links', method: 'POST' })).resolves.toEqual({
      ok: false, error: { status: 400, message: 'unexpected response', retryAfterSeconds: null }
    });
  });

  it('токен попадает в Authorization, тело — в JSON', async () => {
    const fetchMock = json(200, { totalElements: 0 });
    await request({ path: '/api/links?page=1', token: 'JWT' });
    expect(fetchMock).toHaveBeenCalledWith('/api/links?page=1',
      expect.objectContaining({ headers: { Authorization: 'Bearer JWT' } }));
  });

  it('сетевой сбой — status 0 и текст про связь', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request({ path: '/api/links' })).resolves.toEqual({
      ok: false, error: { status: 0, message: 'network error', retryAfterSeconds: null }
    });
  });

  it('аборт по таймауту даёт status 0 и timeout', async () => {
    vi.useFakeTimers();
    // mockImplementation, а не mockRejectedValue: промис должен отклониться именно по сигналу,
    // иначе ветка aborted не исполняется никогда, а без неё тест проверяет не таймаут, а аборт
    // руками самого теста.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          (init?.signal as AbortSignal | undefined)?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          );
        })
    );
    const pending = request({ path: '/api/links' });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual({
      ok: false, error: { status: 0, message: 'timeout', retryAfterSeconds: null }
    });
  });
});
