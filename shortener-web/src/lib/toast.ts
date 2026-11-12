import type { Key } from './i18n';

export type ToastItem = { id: number; kind: 'ok' | 'error'; key: Key; vars: Record<string, string | number> };

// Минимальный внешний стор (`useSyncExternalStore` в компоненте): состояния живут здесь, а не в
// React. Хранилище — массив-копия (`items = [...items, item]`), иначе подписчик не увидел бы
// изменения по ссылке.
let seq = 0;
let items: ToastItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function pushToast(kind: ToastItem['kind'], key: Key, vars: ToastItem['vars'] = {}): ToastItem {
  const item: ToastItem = { id: ++seq, kind, key, vars };
  items = [...items, item];
  emit();
  return item;
}

export function dismissToast(id: number): void {
  items = items.filter((item) => item.id !== id);
  emit();
}

export function readToasts(): ToastItem[] {
  return items;
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
