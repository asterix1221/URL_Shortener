import { describe, expect, it } from 'vitest';
import { en } from './en';
import { ru } from './ru';
import { t } from './index';

describe('i18n', () => {
  it('наборы ключей совпадают — недостающий перевод роняет сборку', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });
  it('подставляет переменные и оставляет неизвестную подстановку как есть', () => {
    expect(t('ru', 'links.count', { count: 7 })).toBe('Ссылок: 7');
    expect(t('en', 'links.count', { count: 7 })).toBe('Links: 7');
    expect(t('ru', 'links.retry.in', {})).toBe('Отправить снова через {sec} с');
  });
});
