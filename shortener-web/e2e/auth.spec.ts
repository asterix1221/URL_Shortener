import { expect, test } from '@playwright/test';
import { createLink, PASSWORD, registerAndSignIn, uniqueAlias } from './support';

test('регистрация, создание, копирование и повторный вход', async ({ page }) => {
  const email = await registerAndSignIn(page);
  const alias = uniqueAlias('ui-auth');
  await createLink(page, 'https://example.com/very/long', alias);
  await expect(page.getByRole('link', { name: alias, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Копировать ${alias}` }).click();
  await expect(page.getByRole('status')).toContainText('Скопировано');

  // Шаг 4 брифа: ветка зависит от защищённости контекста. В GitHub Actions (localhost)
  // читается сам буфер, в Jenkins (host.docker.internal) — значение, подготовленное к копированию.
  await page.bringToFront(); // readText() требует фокуса документа: без него DOMException NotAllowedError
  const expected = await page.getByRole('link', { name: alias, exact: true }).getAttribute('data-short-url');
  const secure = await page.evaluate(() => window.isSecureContext);
  console.log('clipboard branch:', secure ? 'async-clipboard' : 'exec-command');
  const copied = await page.evaluate(async (isSecure) => {
    if (isSecure && navigator.clipboard) return navigator.clipboard.readText();
    return document.querySelector<HTMLTextAreaElement>('textarea[data-copy-fallback]')?.value ?? null;
  }, secure);
  expect(copied).toBe(expected);
  expect(copied).toContain(alias);

  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(/\/app\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem('shortener.token'))).toBeNull();

  // вход тем же аккаунтом без регистрации: пароль тот же, форма переключается на «Вход»
  await page.getByRole('tab', { name: 'Вход' }).click();
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.getByRole('link', { name: alias, exact: true })).toBeVisible();
});

test('переключатель языка меняет текст без перезагрузки', async ({ page }) => {
  await registerAndSignIn(page);
  await expect(page.getByRole('button', { name: 'Создать' })).toBeVisible();
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('shortener.lang'))).toBe('en');
});
