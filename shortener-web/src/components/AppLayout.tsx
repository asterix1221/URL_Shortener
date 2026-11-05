import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n/I18nProvider';
import { useTheme } from '../theme/useTheme';
import { Toasts } from './Toasts';

// Кнопки языка подписаны латиницей и не переводятся: доступное имя переключателя обязано быть
// одним и тем же в русском и английском интерфейсе, иначе e2e задачи 15 не нашёл бы его, кликнув
// по нему же и сменив локаль.
const LANGS = [
  { code: 'ru', label: 'RU' },
  { code: 'en', label: 'EN' }
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { token, signOut } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <div className="page">
      <header className="app-header">
        <Link to="/" className="brand">
          {t('app.title')}
        </Link>
        {/* `role="group"` с `aria-label` — единственный потребитель ключа `lang.label`: скринридер
            обязан объявить «Язык: две кнопки», а не две непонятные латинские буквы подряд */}
        <div role="group" aria-label={t('lang.label')}>
          {LANGS.map((option) => (
            <button
              key={option.code}
              type="button"
              className="btn-ghost"
              aria-pressed={lang === option.code}
              onClick={() => setLang(option.code)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('theme.label')}
          aria-pressed={theme === 'dark'}
          onClick={toggle}
        >
          <span className="theme-dot" aria-hidden="true" />
        </button>
        {token ? (
          <button type="button" className="btn-ghost" onClick={signOut}>
            {t('nav.logout')}
          </button>
        ) : null}
      </header>
      <Toasts />
      <main>{children}</main>
    </div>
  );
}
