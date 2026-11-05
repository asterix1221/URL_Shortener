import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // base здесь нужен не для сборки, а для тестов: import.meta.env.BASE_URL читается из него,
  // а по BASE_URL гард и ссылки строят пути вида /app/ (проверки в задачах 12 и 13).
  // Без этой строки BASE_URL = '/' и href="/app/" в тестах недостижим.
  base: '/app/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx']
    }
  }
});
