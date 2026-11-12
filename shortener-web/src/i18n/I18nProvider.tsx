import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { t as translate, type Key, type Lang } from '../lib/i18n';

// Единственный источник языка для приложения: выбор живёт в `localStorage.shortener.lang`
// (не секрет), а `document.documentElement` получает `lang` и `data-lang`, чтобы CSS и
// скринридеры видели смену локали. Язык — `useState`, а не чтение из хранилища при каждом
// рендере: `setLang` из шапки (Task 9) должен перерисовать все подписанные строки.
const STORAGE_KEY = 'shortener.lang';

type I18nValue = {
  lang: Lang;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  setLang: (lang: Lang) => void;
};

const I18nContext = createContext<I18nValue | null>(null);

// Фолбэк на `ru` на любом значении вне двух известных, включая `null` (ключ ещё не сохраняли):
// приложение русскоязычное по умолчанию (спека, раздел про RU/EN), а бросок на незнакомом
// значении уронил бы первый рендер пользователю с чужим `localStorage` на этом домене.
function initialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'en' ? 'en' : 'ru';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (value === null) throw new Error('useI18n вне I18nProvider');
  return value;
}
