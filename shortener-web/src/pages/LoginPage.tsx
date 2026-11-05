import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ApiFailure } from '../api/types';
import { useAuth } from '../auth/useAuth';
import { CredentialsForm, type AuthMode, type Credentials } from '../components/CredentialsForm';
import { useI18n } from '../i18n/I18nProvider';
import type { Key } from '../lib/i18n';

const MODES: readonly { value: AuthMode; labelKey: Key }[] = [
  { value: 'login', labelKey: 'auth.mode.login' },
  { value: 'register', labelKey: 'auth.mode.register' }
];

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>('login');

  // Переход на `/` делает страница, а не `AuthProvider`: провайдер возвращает результат и ничего
  // о маршрутах не решает, а `handleUnauthorized` с этого же экрана ушёл бы на /login?expired=1
  // циклом по самому себе — значит 401 здесь остаётся обычной ошибкой формы.
  const submit = useCallback(
    async (values: Credentials): Promise<ApiFailure | null> => {
      const outcome =
        mode === 'register' ? await signUp(values.email, values.password) : await signIn(values.email, values.password);
      if (!outcome.ok) return outcome.error;
      navigate('/');
      return null;
    },
    [mode, navigate, signIn, signUp]
  );

  return (
    <div className="page">
      {params.get('expired') !== null ? (
        <div className="state" role="status">
          <p>{t('auth.session.expired')}</p>
        </div>
      ) : null}
      <div role="tablist">
        {MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={mode === option.value}
            className={mode === option.value ? 'btn' : 'btn-ghost'}
            onClick={() => setMode(option.value)}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>
      {/* `key` по режиму: при переключении форма размонтируется, и введённое для одного режима
          не уезжает в другой вместе с текстом ошибки */}
      <CredentialsForm
        key={mode}
        mode={mode}
        onSubmit={submit}
        onSwitchMode={() => setMode(mode === 'login' ? 'register' : 'login')}
      />
      {/* отзыва токена на сервере нет, поэтому подсказка постоянная: закрыть вкладку — единственный
          способ потерять токен наверняка */}
      <p>{t('auth.hint.no-logout')}</p>
    </div>
  );
}
