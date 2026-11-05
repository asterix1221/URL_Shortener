import { useState, type FormEvent } from 'react';
import type { ApiFailure } from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import { serverErrorField } from '../lib/errors';
import { errorKeyFor } from '../lib/errorKeys';
import type { Key } from '../lib/i18n';
import { validateCredentials } from '../lib/validation';
import { ErrorState } from './ErrorState';
import { Spinner } from './Spinner';

export type AuthMode = 'login' | 'register';
export type Credentials = { email: string; password: string };

type FieldName = 'email' | 'password';

type Props = {
  mode: AuthMode;
  // `null` — успех (страница сама уходит на `/`), иначе серверная ошибка, которую форма
  // раскладывает по полям.
  onSubmit: (values: Credentials) => Promise<ApiFailure | null>;
  onSwitchMode: () => void;
};

/**
 * Под какой инпут положить серверный текст. Префикс сообщения (`email: …`) точнее статуса, но
 * есть не во всех ветках `ApiExceptionHandler`; когда его нет, поле решает статус: 409 на
 * регистрацию говорит про занятую почту, 401 — про пару целиком, и тот и другой текст берётся
 * из словаря, а не из `failure.message` (сервер отвечает по-английски).
 */
function serverField(failure: ApiFailure, key: Key): FieldName | null {
  const fromMessage = serverErrorField(failure.message);
  if (fromMessage === 'email' || fromMessage === 'password') return fromMessage;
  return key === 'errors.emailTaken' ? 'email' : null;
}

export function CredentialsForm({ mode, onSubmit, onSwitchMode }: Props) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<Key | null>(null);
  const [passwordError, setPasswordError] = useState<Key | null>(null);
  const [formError, setFormError] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateCredentials({ email, password });
    setEmailError(validation.email ?? null);
    setPasswordError(validation.password ?? null);
    setFormError(null);
    if (validation.email !== undefined || validation.password !== undefined) return;

    setBusy(true);
    const failure = await onSubmit({ email, password });
    setBusy(false);
    if (failure === null) return;

    const key = errorKeyFor(failure, 'auth');
    const field = serverField(failure, key);
    if (field === 'password') setPasswordError(key);
    else if (field === 'email') setEmailError(key);
    else setFormError(key);
  }

  return (
    // `noValidate`: подсказки даёт `validateCredentials` по локалям словаря, а не встроенный
    // текст браузера, который ещё и блокирует отправку до нашей валидации. `aria-busy`: `disabled`
    // на кнопке ассистивным технологиям ничего не сообщает, а занятая форма — сообщает.
    <form onSubmit={handleSubmit} noValidate aria-busy={busy}>
      <div>
        <label htmlFor="auth-email">{t('auth.email')}</label>
        <input
          id="auth-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setEmailError(null);
            // серверная ошибка уровня формы относится к паре «почта + пароль» целиком: пока её не
            // убрали при вводе, под формой висит «неверные данные» рядом с уже переписанным полем
            setFormError(null);
          }}
          aria-invalid={emailError !== null}
          aria-describedby={emailError === null ? undefined : 'auth-email-error'}
        />
        {emailError !== null ? <p id="auth-email-error">{t(emailError)}</p> : null}
      </div>
      <div>
        <label htmlFor="auth-password">{t('auth.password')}</label>
        <input
          id="auth-password"
          name="password"
          type="password"
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setPasswordError(null);
            setFormError(null);
          }}
          aria-invalid={passwordError !== null}
          aria-describedby={passwordError === null ? undefined : 'auth-password-error'}
        />
        {passwordError !== null ? <p id="auth-password-error">{t(passwordError)}</p> : null}
      </div>
      <div>
        {/* спиннер `aria-hidden` и без текста: доступное имя кнопки обязано остаться прежним,
            иначе `getByRole('button', { name: … })` и локаторы e2e потеряли бы её же */}
        <button type="submit" className="btn" disabled={busy}>
          {t(mode === 'register' ? 'auth.submit.register' : 'auth.submit.login')}
          {busy ? <Spinner /> : null}
        </button>
      </div>
      {formError !== null ? <ErrorState message={t(formError)} /> : null}
      <div>
        <button type="button" className="btn-ghost" onClick={onSwitchMode}>
          {t(mode === 'register' ? 'auth.hint.login' : 'auth.hint.register')}
        </button>
      </div>
    </form>
  );
}
