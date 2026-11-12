import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../api/types';
import { useAsync, type AsyncState } from './useAsync';

const FAILURE: ApiFailure = { status: 500, message: 'boom', retryAfterSeconds: null };

// Промис держится открытым до вызова `resolve`: состояние `loading` видно только пока ответ не
// вернулся, а `Promise.resolve(...)` закрывает его до первого `expect`.
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((inner) => {
    resolve = inner;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

describe('useAsync', () => {
  it('стартует с loading и переходит в ready', async () => {
    const gate = deferred<AsyncState<number>>();
    const { result } = renderHook(() => useAsync(() => gate.promise, []));
    expect(result.current.state).toEqual({ status: 'loading' });

    await act(async () => {
      gate.resolve({ status: 'ready', data: 7 });
    });
    expect(result.current.state).toEqual({ status: 'ready', data: 7 });
  });

  it('пробрасывает ошибку слоя целиком, включая retryAfterSeconds', async () => {
    const failing = async (): Promise<AsyncState<number>> => ({ status: 'error', error: FAILURE });
    const { result } = renderHook(() => useAsync(failing, []));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', error: FAILURE }));
  });

  it('перезапускается на смену deps и берёт свежую замыкание-функцию', async () => {
    const spy = vi.fn(async (value: number): Promise<AsyncState<number>> => ({ status: 'ready', data: value }));
    const { result, rerender } = renderHook(({ value }) => useAsync(() => spy(value), [value]), {
      initialProps: { value: 1 }
    });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 1 }));

    rerender({ value: 2 });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 2 }));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('run() отправляет новый запрос с теми же deps', async () => {
    const spy = vi.fn(async (): Promise<AsyncState<number>> => ({ status: 'ready', data: 1 }));
    const { result } = renderHook(() => useAsync(spy, []));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.run();
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  // Размонтирование — единственная возможность попасть в `if (alive)` при `alive === false`: без
  // этого случая ветка в `src/lib` осталась бы непокрытой навсегда (гейт 100 % строк). Реакция на
  // `setState` после unmount в React 19 молча игнорируется, поэтому проверяется две вещи: отсутствие
  // ошибок React и то, что состояние после разрешения ответа осталось прежним.
  it('ответ, пришедший после размонтирования, не записывается в состояние', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const gate = deferred<AsyncState<number>>();
    const { result, unmount } = renderHook(() => useAsync(() => gate.promise, []));
    unmount();

    await act(async () => {
      gate.resolve({ status: 'ready', data: 1 });
    });
    expect(result.current.state).toEqual({ status: 'loading' });
    expect(errors).not.toHaveBeenCalled();
  });
});
