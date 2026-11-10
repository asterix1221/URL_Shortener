import { expect, test } from '@playwright/test';
import { createLink, registerAndSignIn, uniqueAlias } from './support';

test('пусто -> создание -> конфликт -> удаление', async ({ page }) => {
  await registerAndSignIn(page);
  const alias = uniqueAlias('ui-links');
  await expect(page.getByText('Ссылок пока нет — создайте первую сверху.')).toBeVisible();
  await createLink(page, 'https://example.com', alias);
  await expect(page.getByText('Ссылок: 1')).toBeVisible();
  await createLink(page, 'https://example.org', alias);
  await expect(page.getByText('Такой код уже используется')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`Удалить ${alias}`) }).click();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  // Удаление — деактивация (LinkService.delete -> links.deactivate): строка остаётся в выдаче
  // со статусом «Удалена», totalElements не уменьшается. Замер задачи 15 на стенде: после 204
  // список отдаёт totalElements=1 и active=false, поэтому пустого состояния после удаления нет.
  // Проверяем тост и бейдж строки — это то, что пользователь видит после подтверждения диалога.
  await expect(page.getByRole('status')).toContainText('Ссылка деактивирована');
  await expect(page.getByText('Удалена', { exact: true })).toBeVisible();
});