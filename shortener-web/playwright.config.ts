import { defineConfig, devices } from '@playwright/test';

// Стенд поднимается снаружи (compose), webServer здесь сознательно нет.
const base = process.env.E2E_BASE_URL ?? 'http://localhost:28380';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  // Kafka-лаг: те же 20 с, что у Awaitility в автотестах и у цикла в smoke.ps1
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: base,
    headless: true,
    trace: 'retain-on-failure',
    permissions: ['clipboard-read', 'clipboard-write']
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});