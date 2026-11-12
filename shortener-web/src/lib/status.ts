import type { LinkResponse } from '../api/types';
import type { Key } from './i18n';

// Три статуса словаря (`status.active|inactive|expired`) — ровно столько клиенту и доступно:
// `LinkResponse` (`src/api/types.ts:9-12`) несёт `maxClicks`, но не несёт счётчик кликов, поэтому
// «исчерпана» проверять нечем — сервер считает исчерпание сам и отдаёт `410` (`LinkService.java:155`,
// `GoneException` на `:168` и `:172`).
export function statusOf(link: Pick<LinkResponse, 'active' | 'expiresAt'>, now: Date): Key {
  if (!link.active) return 'status.inactive';
  if (link.expiresAt && new Date(link.expiresAt) <= now) return 'status.expired';
  return 'status.active';
}
