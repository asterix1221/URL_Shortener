export type ApiFailure = { status: number; message: string; retryAfterSeconds: number | null };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };
export type RequestOptions = {
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  token?: string | null;
};
export type LinkResponse = {
  code: string; shortUrl: string; originalUrl: string; createdAt: string;
  expiresAt: string | null; maxClicks: number | null; active: boolean;
};
export type CreateLinkPayload = { url: string; alias?: string; expiresAt?: string; maxClicks?: number };
export type Page<T> = {
  content: T[]; number: number; size: number; totalElements: number;
  totalPages: number; first: boolean; last: boolean;
};
export type DailyClicks = { date: string; count: number };
export type ReferrerClicks = { referrer: string; count: number };
export type LinkStats = { code: string; totalClicks: number; byDay: DailyClicks[]; topReferrers: ReferrerClicks[] };
export type AuthResponse = { accessToken: string; expiresIn: number };
