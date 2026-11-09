import { expect, test } from '@playwright/test';
import { createLink, registerAndSignIn } from './support';

test('клики доходят до статистики через Kafka', async ({ page, request }) => {
  await registerAndSignIn(page);
  await createLink(page, 'https://example.com/stats', 'ui-stats-1');
  for (let i = 0; i < 2; i++) {
    const redirect = await request.get('/ui-stats-1', { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);
  }
  await page.getByRole('link', { name: 'ui-stats-1', exact: true }).click();
  await expect(page.getByText('Короткая ссылка')).toBeVisible();
  await expect.poll(async () => {
    await page.getByRole('button', { name: 'Обновить' }).click();
    return page.locator('[data-metric=total-clicks]').textContent();
  }, { intervals: [1_000], timeout: 20_000 }).toBe('2');
  await expect(page.getByText('Прямые переходы')).toBeVisible();
});