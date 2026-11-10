import { expect, test } from '@playwright/test';
import { createLink, registerAndSignIn, uniqueAlias } from './support';

test('клики доходят до статистики через Kafka', async ({ page, request }) => {
  await registerAndSignIn(page);
  const alias = uniqueAlias('ui-stats');
  await createLink(page, 'https://example.com/stats', alias);
  for (let i = 0; i < 2; i++) {
    const redirect = await request.get(`/${alias}`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);
  }
  await page.getByRole('link', { name: alias, exact: true }).click();
  await expect(page.getByText('Короткая ссылка')).toBeVisible();
  await expect.poll(async () => {
    await page.getByRole('button', { name: 'Обновить' }).click();
    return page.locator('[data-metric=total-clicks]').textContent();
  }, { intervals: [1_000], timeout: 20_000 }).toBe('2');
  await expect(page.getByText('Прямые переходы')).toBeVisible();
});
