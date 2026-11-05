import { en } from './en';
import { ru } from './ru';

// `Lang` — литеральный союз, а не `keyof typeof dictionaries` (рулинг 7-A): словарь объявлен
// как `Record<Lang, …>`, поэтому такой alias был бы циклическим — TS2456 + TS2502 на tsc 5.9.3.
// Источник истины по набору ключей — `ru`, отсюда и `Key`.
export type Lang = 'ru' | 'en';
export type Key = keyof typeof ru;

const dictionaries: Record<Lang, Record<Key, string>> = { ru, en };

// Подстановка `{name}` из `vars`; неизвестная подстановка остаётся в тексте как есть.
export function t(lang: Lang, key: Key, vars: Record<string, string | number> = {}): string {
  const template = dictionaries[lang][key];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}
