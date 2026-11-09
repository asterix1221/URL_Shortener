import { expect, test } from '@playwright/test';
import { createLink, registerAndSignIn } from './support';

test('третья ссылка за минуту: баннер, отсчёт и заблокированная кнопка', async ({ page }) => {
  await registerAndSignIn(page);
  await createLink(page, 'https://example.com/a', 'ui-rate-1');
  await createLink(page, 'https://example.com/b', 'ui-rate-2');
  const response = page.waitForResponse((r) => r.url().endsWith('/api/links') && r.status() === 429);
  await page.getByLabel('Длинный адрес').fill('https://example.com/c');
  await page.getByLabel('Свой код (необязательно)').fill('ui-rate-3');
  await page.getByRole('button', { name: 'Создать' }).click();
  const retryAfter = Number((await response).headers()['retry-after']);
  await expect(page.getByText('Слишком часто: лимит на создание ссылок в минуту')).toBeVisible();
  // второй владелец `role="alert"` на странице — `ErrorState` загрузки списка (у него та же роль),
  // и он появляется, только если список не загрузился. Здесь он обязан быть здоров (стенд выше
  // создал две ссылки через UI), поэтому алертов ровно один; проверка заголовка списка идёт
  // ПЕРЕД счётчиком, чтобы деградация списка упала про список, а не про `toHaveCount(1)`
  await expect(page.getByText('Ссылок:')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(1); // сообщение и отсчёт — в одном элементе (Task 11)
  const banner = await page.getByRole('alert').textContent();
  const shown = Number(/(\d+)/.exec(banner ?? '')?.[1]);
  expect(shown).not.toBeNaN();
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThanOrEqual(retryAfter);
  await expect(page.getByRole('button', { name: 'Создать' })).toBeDisabled();
});