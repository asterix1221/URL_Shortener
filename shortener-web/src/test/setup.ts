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

// Хук из setup-файла действует на все тестовые файлы, поэтому сброс не нужно вписывать в каждый
// describe: достаточно одного вызова здесь.
beforeEach(resetBridgedStorage);
