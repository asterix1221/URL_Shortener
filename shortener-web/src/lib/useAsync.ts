import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import type { ApiFailure } from '../api/types';

// Четвёртого статуса `idle` нет: хук стартует сразу с `loading`, а ветка, которую ни один вызов
// не достигает, осталась бы непокрытой в модуле под гейтом 100 % строк (`src/lib`).
export type AsyncState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: ApiFailure };

// Сигнала отмены здесь нет намеренно: `RequestOptions` (`src/api/types.ts:4-8`) поля `signal` не
// имеет, а `client.ts:24` заводит свой `AbortController` на 10 с, так что `fn: (signal) => …` был
// бы параметром, который никто не читает. Флаг `alive` делает то, что действительно нужно: ответ
// отбрасывается, если компонент уже размонтирован (в списке `useAsync` перезапускается на каждой
// смене страницы), и `setState` не попадает в несуществующий узел.
export function useAsync<T>(fn: () => Promise<AsyncState<T>>, deps: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn; // deps решают, когда перезапускать, а не идентичность fn

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    void fnRef.current().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { state, run: useCallback(() => setNonce((value) => value + 1), []) };
}
