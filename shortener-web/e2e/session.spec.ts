import { expect, test } from '@playwright/test';
import { createLink, registerAndSignIn, uniqueAlias } from './support';

test('подменённый токен: любое действие выбрасывает на вход с подсказкой', async ({ page }) => {
  await registerAndSignIn(page);
  await createLink(page, 'https://example.com/x', uniqueAlias('ui-sess'));
  await page.evaluate(() => sessionStorage.setItem('shortener.token', 'undermade.jwt.token'));
  await page.goto('/app/');
  await expect(page).toHaveURL(/\/app\/login\?expired=1$/);
  await expect(page.getByText('Сессия истекла, войдите снова.')).toBeVisible();
});
