import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'shortener.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export type Theme = 'light' | 'dark';
export type ThemeValue = { theme: Theme; toggle: () => void };

// Выбор читается один раз при инициализации: живой подписки на смену системной темы спека не
// просит, поэтому `matchMedia` вызывается ровно один раз на монтирование. Защитной проверки
// `typeof window.matchMedia === 'function'` здесь нет намеренно: `matchMedia` отсутствует только
// в jsdom, а недостающий стаб чинится в `src/test/setup.ts` — продуктовая ветка осталась бы
// непокрытой навсегда (тир `src/**` требует 75 % веток).
function initialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark') return 'dark';
  if (saved === 'light') return 'light';
  // незнакомое значение (чужая запись на этом домене) — как будто выбора не было
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function useTheme(): ThemeValue {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // `theme` в deps, а не функциональный апдейт с записью в хранилище внутри апдейтера: апдейтер
  // выполняется в фазе рендера, а сайд-эффект в рендере — ровно то, что здесь запрещено.
  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
  }, [theme]);

  return { theme, toggle };
}
