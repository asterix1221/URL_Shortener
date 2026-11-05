import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// `globals` в vitest.config.ts выключены, поэтому testing-library не навешивает свой
// `afterEach(cleanup)` сам (рулинг 8-D): без этой строки каждый компонентный тест обязан звать
// `cleanup()` локально — workaround задачи 7, — а второй `render` в файле находил бы дубликаты
// узлов от первого. Файл исключён из замера покрытия (`coverage.exclude: ['src/test/**']`).
afterEach(cleanup);

// Node 26 объявляет на `globalThis` аксессор `localStorage` без значения (хранилище живёт только
// под `--localstorage-file`), и vitest 2.1 из-за этого не переносит хранилище jsdom: в тестах
// `localStorage === undefined`, хотя `window === globalThis`, а `sessionStorage` Node не объявляет
// и он настоящий, jsdom-овский (замерено пробой). `I18nProvider` читает язык на первом рендере, а
// `useTheme` (Task 9) — тему, поэтому без моста монтирование любого теста через харнесс задачи 8
// падает на `TypeError`. Набор методов тот же, что в стабе задачи 7: `getItem`/`setItem`/
// `removeItem` — ровно то, чем приложение трогает хранилище; мост ставится только когда своего
// хранилища нет, чтобы на будущем Node не подменять настоящий.
if (typeof globalThis.localStorage !== 'object') {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string): string | null => map.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        map.set(key, value);
      },
      removeItem: (key: string): void => {
        map.delete(key);
      }
    }
  });
}
