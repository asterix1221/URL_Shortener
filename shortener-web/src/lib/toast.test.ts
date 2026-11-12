import { describe, expect, it, vi } from 'vitest';
import { dismissToast, pushToast, readToasts, subscribeToasts } from './toast';

describe('стор тостов', () => {
  it('pushToast возвращает элемент с растущим id, readToasts отдаёт его в конце списка', () => {
    const first = pushToast('ok', 'links.copied');
    const second = pushToast('error', 'errors.server', { sec: 30 });
    expect(first).toEqual({ id: expect.any(Number), kind: 'ok', key: 'links.copied', vars: {} });
    expect(second.id).toBe(first.id + 1);
    expect(second.kind).toBe('error');
    expect(readToasts().slice(-2)).toEqual([first, second]);
    dismissToast(first.id);
    dismissToast(second.id);
    expect(readToasts()).toEqual([]);
  });

  it('dismissToast убирает только элемент с этим id', () => {
    const kept = pushToast('ok', 'links.deleted');
    const removed = pushToast('error', 'errors.network');
    dismissToast(removed.id);
    expect(readToasts()).toEqual([kept]);
    dismissToast(kept.id);
    expect(readToasts()).toEqual([]);
  });

  it('подписчик слышит push и dismiss, после отписки — нет', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToasts(listener);
    const item = pushToast('ok', 'links.copied');
    expect(listener).toHaveBeenCalledTimes(1);
    dismissToast(item.id);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    const other = pushToast('error', 'errors.timeout');
    expect(listener).toHaveBeenCalledTimes(2);
    dismissToast(other.id);
    expect(readToasts()).toEqual([]);
  });
});
