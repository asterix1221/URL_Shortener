import type { ApiFailure } from '../api/types';
import type { Key } from './i18n';

// Таблица спеки §6 (код ответа → текст для пользователя) в одном месте: страницы не выбирают
// текст сами. Возвращаемый тип — `Key`, поэтому отсутствующий перевод становится ошибкой
// компиляции. Ветки `default` нет: `if`-ы исчерпывают пространство чисел (`status === 0` —
// таймаут или отсутствие связи из Task 3, различаются по `message`), остальное — `400`, и именно
// полнота условий даёт 100 % веток.
export function errorKeyFor(failure: ApiFailure, scope: 'link' | 'auth'): Key {
  if (failure.status === 0) return failure.message === 'timeout' ? 'errors.timeout' : 'errors.network';
  if (failure.status >= 500) return 'errors.server';
  if (failure.status === 429) return 'errors.rateLimit';
  if (failure.status === 401) return scope === 'auth' ? 'errors.credentials' : 'auth.session.expired';
  if (failure.status === 403 || failure.status === 404) return 'errors.notFound';
  if (failure.status === 409) return scope === 'auth' ? 'errors.emailTaken' : 'errors.aliasTaken';
  return 'errors.invalid';
}
