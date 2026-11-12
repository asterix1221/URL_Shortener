import { useCallback, useState, type KeyboardEvent } from 'react';
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

const PANEL_ID = 'auth-panel';
const tabId = (value: AuthMode) => `auth-tab-${value}`;

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

  // Стрелка переносит и выбор, и фокус (APG «manual activation» + роуминг tabindex): без
  // `focus()` фокус остался бы на неактивном табе, который мы только что вывели из порядка обхода.
  function onTabsKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const current = MODES.findIndex((option) => option.value === mode);
    const next = MODES[(current + step + MODES.length) % MODES.length].value;
    setMode(next);
    document.getElementById(tabId(next))?.focus();
  }

  // `.page` принадлежит `AppLayout` (строка 22), поэтому страница — фрагмент: второй `.page` внутри
  // `main` дал бы двойной padding и вложенный max-width, а обычный `<div>` увёл бы детей из-под
  // ритма колонки, который задаёт именно `.page > main`.
  return (
    <>
      {params.get('expired') !== null ? (
        <div className="state" role="status">
          <p>{t('auth.session.expired')}</p>
        </div>
      ) : null}
      <div role="tablist" onKeyDown={onTabsKeyDown}>
        {MODES.map((option) => (
          <button
            key={option.value}
            id={tabId(option.value)}
            type="button"
            role="tab"
            aria-selected={mode === option.value}
            aria-controls={PANEL_ID}
            tabIndex={mode === option.value ? 0 : -1}
            className={mode === option.value ? 'btn' : 'btn-ghost'}
            onClick={() => setMode(option.value)}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>
      {/* `key` по режиму на форме, а не на панели: панель обязана переживать переключение, иначе
          `aria-controls` указывал бы на пересозданный узел */}
      <div id={PANEL_ID} role="tabpanel" aria-labelledby={tabId(mode)}>
        <CredentialsForm
          key={mode}
          mode={mode}
          onSubmit={submit}
          onSwitchMode={() => setMode(mode === 'login' ? 'register' : 'login')}
        />
      </div>
      {/* отзыва токена на сервере нет, поэтому подсказка постоянная: закрыть вкладку — единственный
          способ потерять токен наверняка */}
      <p>{t('auth.hint.no-logout')}</p>
    </>
  );
}
