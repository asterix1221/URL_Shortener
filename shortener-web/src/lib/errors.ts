/**
 * Разбор тела ошибки сервера в подсказки формы.
 *
 * Для `400` `ApiExceptionHandler` кладёт в `message` **первое** нарушение в формате
 * `имяПоля: сообщение` — `ApiExceptionHandler.java:49-52`
 * (`shortener-service/src/main/java/com/example/shortener/common/`):
 * `error.getField() + ": " + error.getDefaultMessage()` и `findFirst()`. Префикс до первого
 * двоеточия и есть указатель, под какой инпут положить текст, поэтому он здесь отделяется от
 * самого сообщения.
 *
 * Модуль сознательно знает только `ApiFailure` и ничего про валидацию задачи 5: `KNOWN_FIELDS` —
 * это имена компонентов DTO (`link/dto/CreateLinkRequest.java:19-22` +
 * `auth/dto/RegisterRequest.java:14-15`, они же у `auth/dto/LoginRequest.java:12-13`), а
 * `LinkFormValues` покрывает лишь четыре поля формы создания и не знает про `email`/`password`.
 *
 * Текст под поле берётся не от сервера: серверные сообщения на английском, а UI обязан показывать
 * локализованный, поэтому ключ перевода даёт HTTP-статус (`errorKeyFor` в задаче 7), а `field`
 * решает лишь то, под какой инпут этот ключ положить.
 */

import type { ApiFailure } from '../api/types';

/** Компоненты DTO, под которые на экране есть инпут; всё остальное — не поле формы. */
const KNOWN_FIELDS = ['url', 'alias', 'expiresAt', 'maxClicks', 'email', 'password'];

/**
 * Разделение по **первому** двоеточию: синтаксис, а не семантика. Префикс поля сервер гарантирует
 * только в ветке `MethodArgumentNotValidException`, остальные `400` — свободный текст, где
 * двоеточие тоже возможно (`LinkService.java:105` бросает
 * `"maxClicks: must be greater than or equal to 1"`), поэтому `'a: b: c'` даёт
 * `{ field: 'a', text: 'b: c' }`. Двоеточия нет вовсе, или оно стоит на нулевой позиции
 * (`': text'`) — префикса нет, и весь текст остаётся сообщением.
 */
export function splitServerMessage(message: string): { field: string | null; text: string } {
  const separator = message.indexOf(':');
  if (separator <= 0) return { field: null, text: message };
  return { field: message.slice(0, separator).trim(), text: message.slice(separator + 1).trim() };
}

/**
 * Имя поля либо `null` — и ничего больше.
 *
 * Фильтр по `KNOWN_FIELDS` живёт здесь, а не в `splitServerMessage`: сплиттер описывает синтаксис
 * (`префикс до первого двоеточия`), эта функция — знание о том, какие поля вообще имеют инпут на
 * экране. В черновике плана фильтр стоял в сплиттере, и тогда два утверждения одного теста
 * противоречили друг другу: `'a: b: c'` обязан возвращать `{ field: 'a', text: 'b: c' }` как
 * синтаксис и `null` как неизвестное поле. Поле вне белого списка → `null` → текст кладётся под
 * форму, а не под инпут.
 */
export function serverErrorField(message: string): string | null {
  const { field } = splitServerMessage(message);
  return field !== null && KNOWN_FIELDS.includes(field) ? field : null;
}

/**
 * `Retry-After` как число секунд отсчёта. Заголовок отдаёт только `RateLimitExceededException`
 * (`ApiExceptionHandler.java:130-137`); когда его нет или он отрицательный, возврата нет — ноль,
 * чтобы компонент рисовал кнопку «повторить», а не таймер обратного отсчёта в никуда.
 */
export function retryAfterSeconds(failure: ApiFailure): number {
  return failure.retryAfterSeconds === null || failure.retryAfterSeconds < 0 ? 0 : failure.retryAfterSeconds;
}
