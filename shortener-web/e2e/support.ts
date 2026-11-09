import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'Passw0rd!';
// Лимит создания ссылок считается на пользователя (LinkController -> rateLimit.acquire(userId)),
// поэтому свой пользователь в каждом файле = своя корзина токенов и маленький лимит не мешает.
export const uniqueEmail = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

export async function registerAndSignIn(page: Page, email = uniqueEmail()) {
  await page.goto('/app/login');
  await page.getByRole('tab', { name: 'Регистрация' }).click();
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  return email;
}

export async function createLink(page: Page, url: string, alias?: string) {
  await page.getByLabel('Длинный адрес').fill(url);
  if (alias !== undefined) await page.getByLabel('Свой код (необязательно)').fill(alias);
  // Форма сбрасывает поля после успеха, а кнопка на время отправки не блокируется (LinkForm):
  // без ожидания ответа следующее заполнение стёр бы сброс, и клик ушёл бы в пустую валидацию
  // вместо запроса. Замер задачи 15: без ожидания сценарий лимита отправлял только два запроса
  // и не получал 429, хотя на уровне API третий запрос за минуту отдаёт 429.
  const posted = page.waitForResponse((r) => r.url().endsWith('/api/links') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Создать' }).click();
  await posted;
  // Строка появляется после перезапроса списка: к этому моменту форма уже сброшена, и следующее
  // заполнение не пересекается со сбросом. При конфликте кода строка уже есть — проверка не мешает.
  if (alias !== undefined) await expect(page.getByRole('link', { name: alias, exact: true })).toBeVisible();
}