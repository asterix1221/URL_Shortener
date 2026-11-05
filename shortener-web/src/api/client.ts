import type { ApiFailure, ApiResult, RequestOptions } from './types';

export type { ApiFailure, ApiResult } from './types';

const TIMEOUT_MS = 10_000;

async function failure(response: Response): Promise<ApiFailure> {
  const retryAfter = response.headers.get('Retry-After');
  const text = await response.text();
  let message = 'unexpected response';
  try {
    const parsed = JSON.parse(text) as { message?: string };
    if (typeof parsed.message === 'string' && parsed.message.length > 0) message = parsed.message;
  } catch {
    if (response.status >= 500) message = 'service unavailable';
  }
  return { status: response.status, message, retryAfterSeconds: retryAfter === null ? null : Number(retryAfter) };
}

export async function request<T>(options: RequestOptions): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(options.path, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });
    if (!response.ok) return { ok: false, error: await failure(response) };
    if (response.status === 204) return { ok: true, data: undefined as T };
    // тело 2xx читается текстом и разбирается отдельно: response.json() бросил бы SyntaxError
    // внутрь того же try, чей единственный catch отдаёт status 0, и нормально долетевший
    // ответ (например, HTML из SPA-fallback вместо JSON) был бы показан как «проблема со
    // связью». Поток после неудачного .json() не перечитать, поэтому текст, а не json().
    const raw = await response.text();
    try {
      return { ok: true, data: JSON.parse(raw) as T };
    } catch {
      return { ok: false, error: { status: response.status, message: 'unexpected response', retryAfterSeconds: null } };
    }
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    return {
      ok: false,
      error: { status: 0, message: aborted ? 'timeout' : 'network error', retryAfterSeconds: null }
    };
  } finally {
    clearTimeout(timer);
  }
}
