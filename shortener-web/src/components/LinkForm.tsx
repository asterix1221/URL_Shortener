import { useEffect, useState, type FormEvent } from 'react';
import type { ApiFailure, CreateLinkPayload } from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import { retryAfterSeconds, serverErrorField } from '../lib/errors';
import { errorKeyFor } from '../lib/errorKeys';
import type { Key } from '../lib/i18n';
import { toIsoInstant, validateLinkForm, type LinkFormValues } from '../lib/validation';
import { ErrorState } from './ErrorState';
import { Spinner } from './Spinner';

type FieldName = keyof LinkFormValues;

type Props = {
  // Граница формы та же, что у `CredentialsForm` (задача 10): форма не знает ни про токен, ни про
  // гард 401 — она отдаёт payload наружу и получает `null` (успех) либо серверную ошибку.
  onSubmit: (payload: CreateLinkPayload) => Promise<ApiFailure | null>;
};

/**
 * Под какой инпут положить серверный текст. Префикс сообщения (`url: …`) точнее статуса, но есть
 * не во всех ветках `ApiExceptionHandler`; когда его нет, поле решает статус: 409 на создание
 * говорит про занятый код. `email`/`password` в `KNOWN_FIELDS` (`errors.ts:24`) инпута на этой
 * форме не имеют, поэтому они сюда не попадают и текст уходит под форму.
 */
function serverField(failure: ApiFailure, key: Key): FieldName | null {
  const fromMessage = serverErrorField(failure.message);
  if (fromMessage === 'url' || fromMessage === 'alias' || fromMessage === 'expiresAt' || fromMessage === 'maxClicks') {
    return fromMessage;
  }
  return key === 'errors.aliasTaken' ? 'alias' : null;
}

export function LinkForm({ onSubmit }: Props) {
  const { t } = useI18n();
  const [values, setValues] = useState<LinkFormValues>({ url: '', alias: '', expiresAt: '', maxClicks: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, Key>>>({});
  const [formError, setFormError] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);
  // Баннер `429` в одном узле `role="alert"` (рулинг 11-J): `limited` включает сам баннер, а
  // `retryIn` — только отсчётку и блокировку кнопки. Раздельно, потому что `Retry-After` бывает
  // нет (лимит может прийти без заголовка), а текст про лимит показать всё равно надо.
  const [limited, setLimited] = useState(false);
  const [retryIn, setRetryIn] = useState(0);

  useEffect(() => {
    if (retryIn <= 0) return;
    // настоящий `setTimeout`, а не `setInterval`: тик на 1 с и остановка на нуле без второго
    // признака «отсчёт кончился»; fake-таймеры сломали бы `userEvent` в этом же тесте
    const id = setTimeout(() => setRetryIn((value) => value - 1), 1000);
    return () => clearTimeout(id);
  }, [retryIn]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateLinkForm(values, new Date());
    setFieldErrors(validation);
    setFormError(null);
    setLimited(false);
    setRetryIn(0);
    if (Object.keys(validation).length > 0) return;

    setBusy(true);
    const failure = await onSubmit(payload(values));
    setBusy(false);
    if (failure === null) {
      setValues({ url: '', alias: '', expiresAt: '', maxClicks: '' });
      return;
    }

    if (failure.status === 429) {
      // ответ слоя уже распарсил `Retry-After` (`client.ts:17`); до нуля кнопка заблокирована
      setLimited(true);
      setRetryIn(retryAfterSeconds(failure));
      return;
    }
    const key = errorKeyFor(failure, 'link');
    const field = serverField(failure, key);
    if (field === null) setFormError(key);
    else setFieldErrors({ [field]: key });
  }

  function change(field: FieldName, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
    // подсказка снята на первом же символе: иначе «Обязательное поле» висит под полем, которое
    // уже заполнено, а серверный текст — рядом с переписанным значением
    setFieldErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError(null);
  }

  return (
    <section className="state">
      <h2>{t('links.create')}</h2>
      {/* `noValidate`: подсказки даёт `validateLinkForm` по словарю, а не встроенный текст
          браузера, который к тому же блокирует отправку до нашей валидации. `aria-busy` занята
          форма, `disabled` на кнопке — нет: ассистивные технологии читают первое. */}
      <form onSubmit={handleSubmit} noValidate aria-busy={busy}>
        <div>
          <label htmlFor="link-url">{t('links.field.url')}</label>
          <Field
            id="link-url"
            name="url"
            type="url"
            autoComplete="off"
            value={values.url}
            error={fieldErrors.url ?? null}
            onChange={(value) => change('url', value)}
          />
        </div>
        <div>
          <label htmlFor="link-alias">{t('links.field.alias')}</label>
          <Field
            id="link-alias"
            name="alias"
            type="text"
            autoComplete="off"
            value={values.alias}
            error={fieldErrors.alias ?? null}
            onChange={(value) => change('alias', value)}
          />
        </div>
        <div>
          <label htmlFor="link-expires">{t('links.field.expires')}</label>
          <Field
            id="link-expires"
            name="expiresAt"
            type="datetime-local"
            value={values.expiresAt}
            error={fieldErrors.expiresAt ?? null}
            onChange={(value) => change('expiresAt', value)}
          />
        </div>
        <div>
          <label htmlFor="link-clicks">{t('links.field.maxClicks')}</label>
          {/* `inputMode` вместо `type="number"`: значение живёт в строке (`LinkFormValues`), а
              спиннер и колёсико `number` меняли бы его мимо `onChange`-очистки ошибки */}
          <Field
            id="link-clicks"
            name="maxClicks"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={values.maxClicks}
            error={fieldErrors.maxClicks ?? null}
            onChange={(value) => change('maxClicks', value)}
          />
        </div>
        <div>
          {/* спиннер `aria-hidden` и без текста: доступное имя кнопки обязано остаться «Создать»,
              иначе `getByRole('button', { name: 'Создать' })` в тесте 429 и в e2e провалился бы
              посреди проверки блокировки */}
          <button type="submit" className="btn" disabled={busy || retryIn > 0}>
            {t('links.submit')}
            {busy ? <Spinner /> : null}
          </button>
        </div>
      </form>
      {limited ? (
        <div className="state state--error" role="alert">
          <p>{t('errors.rateLimit')}</p>
          {retryIn > 0 ? <p>{t('links.retry.in', { sec: retryIn })}</p> : null}
        </div>
      ) : null}
      {formError !== null ? <ErrorState message={t(formError)} /> : null}
    </section>
  );
}

// Подпись поля живёт рядом с инпутом, а не в `title`: `aria-describedby` озвучивает её при фокусе,
// а `aria-invalid` говорит, какое именно поле сломано — иначе баннер на четыре поля означал бы
// «что-то не так», а не «исправь код».
function Field({
  id,
  name,
  type,
  value,
  error,
  inputMode,
  autoComplete,
  onChange
}: {
  id: string;
  name: string;
  type: string;
  value: string;
  error: Key | null;
  inputMode?: 'numeric';
  autoComplete?: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : `${id}-error`}
      />
      {error === null ? null : <p id={`${id}-error`}>{t(error)}</p>}
    </>
  );
}

/**
 * Пустое поле кроме `url` означает «не задано»: сервер ждёт `null`, а не пустую строку,
 * поэтому поля добавляются в payload только с реальным значением (`CreateLinkRequest.java:19-22`).
 */
function payload(values: LinkFormValues): CreateLinkPayload {
  const result: CreateLinkPayload = { url: values.url.trim() };
  const alias = values.alias.trim();
  if (alias !== '') result.alias = alias;
  const expires = toIsoInstant(values.expiresAt);
  if (expires !== null) result.expiresAt = expires;
  if (values.maxClicks !== '') result.maxClicks = Number(values.maxClicks);
  return result;
}
