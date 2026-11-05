import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { installStorageBridge, resetBridgedStorage } from './storage';

// `globals` в vitest.config.ts выключены, поэтому testing-library не навешивает свой
// `afterEach(cleanup)` сам (рулинг 8-D): без этой строки каждый компонентный тест обязан звать
// `cleanup()` локально — workaround задачи 7, — а второй `render` в файле находил бы дубликаты
// узлов от первого. Файл исключён из замера покрытия (`coverage.exclude: ['src/test/**']`).
afterEach(cleanup);

// Мост над `localStorage`, которого в этом окружении нет, и его сброс — в `storage.ts`, где та же
// фабрика кормит стаб `I18nProvider.test.tsx`: раньше это были две копии одного кода с разной
// семантикой (Map моста не чистился между тестами, стаб задачи 7 перекрывал мост целиком).
installStorageBridge();

// Сброс между тестами одного файла обязателен для обоих хранилищ: мост покрывается здесь, а
// `sessionStorage` — настоящий jsdom-объект, и канал токена (`shortener.token`, задача 8) тек бы
// из теста в тест, пока тесты не чистят его руками. Порядок вызовов важен: `beforeEach` из
// setup-файла отрабатывает раньше `beforeEach` самого теста, поэтому тест, который пишет токен
// в своём хуке или в теле, ничего не теряет.
beforeEach(resetBridgedStorage);
beforeEach(() => {
  sessionStorage.clear();
});

// В jsdom нет `window.matchMedia` (замерено на этом стенде: `new JSDOM().window.matchMedia` →
// `undefined`), а `useTheme` (задача 9) спрашивает системную тему на первом рендере — без стаба
// падал бы каждый тест, монтирующий `AppLayout`, то есть все экраны задач 10–12. `matches: false`
// значит «светлая тема по умолчанию». Защитная ветка `typeof window.matchMedia === 'function'` в
// продуктовом коде вместо этого стаба отвергнута: вторая её ветка осталась бы непокрытой
// навсегда, а тир `src/**` требует 75 % веток.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })
});
