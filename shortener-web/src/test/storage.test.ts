import { describe, expect, it } from 'vitest';
import { createStorage } from './storage';

describe('createStorage', () => {
  it('полный профиль Storage: get/set/remove, длина, ключ по позиции, clear', () => {
    const storage = createStorage();
    expect(storage.length).toBe(0);
    expect(storage.getItem('shortener.lang')).toBeNull();

    storage.setItem('shortener.lang', 'en');
    storage.setItem('shortener.theme', 'dark');
    expect(storage.getItem('shortener.lang')).toBe('en');
    expect(storage.length).toBe(2);
    // key(index) отдаёт порядок вставки, как window.localStorage: на нём держится сброс моста
    expect(storage.key(0)).toBe('shortener.lang');
    expect(storage.key(1)).toBe('shortener.theme');
    expect(storage.key(2)).toBeNull();

    storage.removeItem('shortener.lang');
    expect(storage.length).toBe(1);
    storage.clear();
    expect(storage.length).toBe(0);
    expect(storage.getItem('shortener.theme')).toBeNull();
  });
});

describe('мост localStorage из setup.ts', () => {
  // Это пара, а не два независимых теста: первый пишет ключ, второй проверяет, что
  // beforeEach(resetBridgedStorage) из setup.ts его стёр. Без сброса мост живёт весь файл, и
  // выбор, оставленный одним тестом, попал бы в первый рендер I18nProvider у следующего — ровно
  // та текучесть, которую задачи 9 (shortener.theme) и 12 (shortener.lang) получили бы бесплатно.
  it('в мост можно писать, как в настоящее хранилище', () => {
    localStorage.setItem('shortener.lang', 'en');
    expect(localStorage.getItem('shortener.lang')).toBe('en');
  });

  it('перед следующим тестом мост пуст', () => {
    expect(localStorage.getItem('shortener.lang')).toBeNull();
  });

  // Дескриптор без writable — data-свойство с writable: false, и простая запись в глобал бросает
  // TypeError в строгом режиме: тесты, которым подставляется своё хранилище, падали бы не на своём
  // коде. Проверяем от обратного — запись проходит и её можно вернуть.
  it('globalThis.localStorage перезаписывается простым присваиванием', () => {
    const original = globalThis.localStorage;
    const replacement = createStorage();

    expect(() => {
      globalThis.localStorage = replacement;
    }).not.toThrow();
    expect(localStorage.getItem('shortener.lang')).toBeNull();

    globalThis.localStorage = original;
  });
});
