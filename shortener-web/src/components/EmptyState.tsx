import type { ReactNode } from 'react';

// Текст кладёт страница: компонент общий для пустого списка (`links.empty`) и пустой гистограммы
// с её заголовком (`detail.byDay`), поэтому правильного ключа внутри него быть не может.
// `div`, а не `p`: у пустой гистограммы (задача 12) внутри заголовок, а `<p>` заголовка не
// допускает.
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="state state--empty">{children}</div>;
}
