// Один механизм на весь харнесс. До этого их было два и они были не эквивалентны: Map моста в
// `setup.ts` жил весь файл (ключи текли между тестами), а фабрика стаба в I18nProvider.test.tsx
// создавалась заново на каждый тест, и `vi.stubGlobal` перекрывал мост, делая его мёртвым кодом.
// Здесь фабрика одна — её используют и мост, и стаб, — а профиль полный: тип `Storage` требует
// `clear`/`length`/`key`, и именно `clear` кормит сброс моста ниже.
export function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      map.set(key, value);
    },
    removeItem: (key: string): void => {
      map.delete(key);
    },
    clear: (): void => {
      map.clear();
    },
    get length(): number {
      return map.size;
    },
    key: (index: number): string | null => [...map.keys()][index] ?? null
  };
}

// Хранилище, которое поставил именно мост: сброс обязан чистить его, а не любой `localStorage`
// подряд (в I18nProvider.test.tsx поверх моста стоит стаб, и трогать его должен beforeEach теста,
// а не настройка харнесса).
let bridged: Storage | null = null;

// Node 26 объявляет на `globalThis` аксессор `localStorage` без значения (хранилище живёт только
// под `--localstorage-file`), и vitest 2.1 из-за этого не переносит хранилище jsdom: в тестах
// `localStorage === undefined`, хотя `window === globalThis` (замерено пробой). `I18nProvider`
// читает язык на первом рендере, `useTheme` (задача 9) — тему, поэтому без моста монтируется
// любой тест через харнесс задачи 8. Условие оставляем как есть: на рантайме с настоящим
// хранилищем подменять его стабом нельзя.
export function installStorageBridge(): void {
  if (typeof globalThis.localStorage !== 'object') {
    bridged = createStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      // без writable дескриптор остаётся data-свойством с writable: false, и простая запись
      // `globalThis.localStorage = …` в строгом режиме бросает TypeError (проверяется в
      // storage.test.ts) — подмена хранилища из теста упиралась бы в настройку харнесса
      writable: true,
      value: bridged
    });
  }
}

// Сброс между тестами одного файла обязателен: мост живёт до конца файла, задача 9 пишет
// `shortener.theme`, задача 12 читает `shortener.lang` через `I18nProvider`, который харнесс
// монтирует в каждом тесте. Без этой строки выбор, оставленный одним тестом, определял бы
// первый рендер следующего — налог на отладку для задач 9–13.
export function resetBridgedStorage(): void {
  bridged?.clear();
}
