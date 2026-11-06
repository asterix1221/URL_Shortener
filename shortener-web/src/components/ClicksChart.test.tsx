import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatDay } from '../lib/format';
import { ClicksChart } from './ClicksChart';

// Компонент принимает `lang` пропсом и зовёт чистый `t` из `src/lib/i18n`, поэтому его модульный
// тест монтирует график без провайдеров: проверяется геометрия столбцов, а не контекст.
describe('ClicksChart', () => {
  it('рисует столбец на день и считает сумму по byDay', () => {
    render(
      <ClicksChart
        byDay={[
          { date: '2026-11-03', count: 2 },
          { date: '2026-11-04', count: 5 }
        ]}
        lang="ru"
      />
    );
    // `role="img"` с именем из `detail.byDay`: у столбцов по дням на этой странице нет текстового
    // эквивалента (`ReferrersTable` покрывает источники, а не дни), так что без подписанной роли
    // график просто исчезал бы из дерева доступных имён
    expect(screen.getByRole('img', { name: /по дням/i })).toBeInTheDocument();
    expect(document.querySelectorAll('rect.bar')).toHaveLength(2);
    // 25, а не 30: шкалу даёт `buildScale` (для `max = 5` это `{max: 6, ticks: [0, 2, 4, 6]}`),
    // и столбец обязан встать ровно под верхний тик, иначе график противоречил бы своей оси
    expect(document.querySelector('rect.bar:last-of-type')!.getAttribute('height')).toBe('25');
    expect(screen.getByText(formatDay('2026-11-04', 'ru'))).toBeInTheDocument();
  });

  it('пустой byDay — EmptyState с тем же заголовком и без столбцов', () => {
    render(<ClicksChart byDay={[]} lang="ru" />);
    expect(screen.getByText(/по дням/i)).toBeInTheDocument();
    expect(document.querySelectorAll('rect.bar')).toHaveLength(0);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('нулевой день не делит шкалу на ноль: столбец нулевой высоты, подпись на месте', () => {
    render(<ClicksChart byDay={[{ date: '2026-11-05', count: 0 }]} lang="en" />);
    expect(document.querySelector('rect.bar')!.getAttribute('height')).toBe('0');
    expect(screen.getByRole('img', { name: /by day/i })).toBeInTheDocument();
  });

  // Проверка шага, а не наличия подписи в DOM: `getByText` нашёл бы метку и когда она залегла на
  // соседнюю. `jsdom` не считает глифы (`getBBox` не реализован), поэтому ширина метки оценивается
  // по числу знаков: 9 px шрифт, ~5 px на знак, самая длинная метка `ru` — «03 нояб.» (8 знаков).
  // При `BAR_GAP = 6` шаг давал бы 20 px, и тест краснеет.
  it('шаг столбцов не уже самой широкой подписи дня', () => {
    render(
      <ClicksChart
        byDay={[
          { date: '2026-11-03', count: 2 },
          { date: '2026-11-04', count: 5 },
          { date: '2026-11-05', count: 1 }
        ]}
        lang="ru"
      />
    );
    const bars = [...document.querySelectorAll('rect.bar')].map((bar) => Number(bar.getAttribute('x')));
    const labels = [...document.querySelectorAll('svg text')].filter((node) =>
      node.getAttribute('text-anchor') === 'middle'
    );
    const widest = Math.max(...labels.map((node) => (node.textContent ?? '').length)) * 5;
    expect(bars[1] - bars[0]).toBeGreaterThanOrEqual(widest);
    expect(bars[2] - bars[1]).toBeGreaterThanOrEqual(widest);
  });
});
