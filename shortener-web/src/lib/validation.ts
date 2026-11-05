/**
 * Клиентская валидация форм — зеркало серверных правил. Каждое число и каждая регулярка
 * повторяют аннотации Bean Validation из DTO и константы `LinkService`; расхождение здесь
 * означает форму, которая пропускает то, что сервер всё равно отвергнет своим `400`.
 *
 * Значения ошибок — ключи словаря (`errors.aliasReserved`), а не человекочитаемый текст и не
 * свободные machine-строки: у потребительских форм был бы второй источник истины для переводов.
 * Все десять литералов `ValidationKey` есть в словаре, поэтому `t(errors.aliasReserved)` не
 * требует каста.
 *
 * Проверяется ровно то, что видно клиенту: регистронезависимость резерва совпадает с серверной
 * (`LinkService` понижает регистр перед сравнением), а занятость кода (`existsByCode`) клиенту
 * недоступна и остаётся за `409`.
 *
 * Осознанное неполное зеркало — схема URL: `LinkService.java:98` зовёт `UrlValidator.requireHttpUrl`
 * (http/https + непустой хост), а у клиента такого правила и ключа в словаре под него нет; его
 * закрывают `input type="url"` в форме (задача 11) и `400` с разбором по полям (задача 6).
 */

export type LinkFormValues = { url: string; alias: string; expiresAt: string; maxClicks: string };

export type ValidationKey =
  | 'errors.required' | 'errors.urlLong' | 'errors.aliasFormat' | 'errors.aliasReserved'
  | 'errors.expiresPast' | 'errors.clicksInteger' | 'errors.clicksMin' | 'errors.clicksMax'
  | 'errors.email' | 'errors.password';

export type FieldErrors = Partial<Record<keyof LinkFormValues, ValidationKey>>;
export type CredentialErrors = Partial<Record<'email' | 'password', ValidationKey>>;

/** Зеркало `LinkService.ALIAS_PATTERN` (`^[A-Za-z0-9_-]{3,32}$`) и `@Size(min = 3, max = 32)`. */
export const ALIAS_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
/** Копия `LinkService.RESERVED_CODES` покомпонентно; порядок тот же, сравнение — в нижнем регистре. */
export const RESERVED_CODES = ['api', 'actuator', 'swagger-ui', 'v3', 'app', 'assets'];
/** Упрощённая пара к `@Email` из `RegisterRequest`: разбирается адрес, а не «почта существует». */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Целое в строке поля `maxClicks`: дробь или текст в `Integer` не распакуется. */
const CLICKS_PATTERN = /^-?\d+$/;
/**
 * Поле в DTO — `Integer` (`CreateLinkRequest.java:22`): больше 2^31-1 Jackson не распакует, и
 * это не `400` с текстом про поле, а `HttpMessageNotReadableException`, который доходит до
 * catch-all `ApiExceptionHandler.onUnexpected` и даёт `500` — на фронте `errors.server` вместо
 * подсказки у поля. Отсюда верхняя граница и ключ `errors.clicksMax`.
 */
const CLICKS_MAX = 2_147_483_647;

/**
 * Значение `datetime-local` (локальное время без смещения) в UTC-мгновение формата ISO.
 * Пустое или неразобранное — `null`: сервер обязан получить либо настоящий `Instant`,
 * либо отсутствие поля, но не строку `Invalid date`.
 */
export function toIsoInstant(localValue: string): string | null {
  if (!localValue) return null;
  const parsed = new Date(localValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Форма создания ссылки: `@NotBlank @Size(max = 2048) url`, необязательный `alias`
 * (паттерн + резерв), `@Future expiresAt`, `@Min(1)` и целый тип `maxClicks` с границей `Integer`.
 * Пустое поле кроме `url` означает «не задано», а не ошибку: сервер так и трактует `null`.
 */
export function validateLinkForm(values: LinkFormValues, now: Date): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.url.trim()) errors.url = 'errors.required';
  else if (values.url.length > 2048) errors.url = 'errors.urlLong';

  const alias = values.alias.trim();
  if (alias) {
    if (!ALIAS_PATTERN.test(alias)) errors.alias = 'errors.aliasFormat';
    else if (RESERVED_CODES.includes(alias.toLowerCase())) errors.alias = 'errors.aliasReserved';
  }

  if (values.expiresAt) {
    const instant = toIsoInstant(values.expiresAt);
    if (instant === null || new Date(instant) <= now) errors.expiresAt = 'errors.expiresPast';
  }

  if (values.maxClicks) {
    if (!CLICKS_PATTERN.test(values.maxClicks)) errors.maxClicks = 'errors.clicksInteger';
    else if (Number(values.maxClicks) < 1) errors.maxClicks = 'errors.clicksMin';
    else if (Number(values.maxClicks) > CLICKS_MAX) errors.maxClicks = 'errors.clicksMax';
  }
  return errors;
}

/**
 * Регистрация и вход: `@NotBlank @Email @Size(max = 254) email`, `@NotBlank @Size(min = 8, max = 72)`
 * пароль. `@NotBlank` для сервера означает пустую и строку из одних пробелов, а `@Size` считает
 * длину по сырому значению: `.trim()` есть только в проверке на пустоту, поэтому `' Passw0rd! '`
 * проходит и здесь, и на сервере — ложного отказа правка не вносит.
 */
export function validateCredentials(values: { email: string; password: string }): CredentialErrors {
  const errors: CredentialErrors = {};
  if (!values.email.trim()) errors.email = 'errors.required';
  else if (!EMAIL_PATTERN.test(values.email.trim()) || values.email.length > 254) errors.email = 'errors.email';
  if (!values.password.trim()) errors.password = 'errors.required';
  else if (values.password.length < 8 || values.password.length > 72) errors.password = 'errors.password';
  return errors;
}
