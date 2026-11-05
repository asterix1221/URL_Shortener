import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LinkResponse } from '../api/types';
import { renderWithProviders } from '../test/render';
import { StatusBadge } from './StatusBadge';

const NOW = new Date('2026-11-05T00:00:00Z');

const link = (patch: Partial<LinkResponse> = {}): LinkResponse => ({
  code: 'abc123',
  shortUrl: 'http://localhost:28080/app/abc123',
  originalUrl: 'https://example.com/page',
  createdAt: '2026-11-01T00:00:00Z',
  expiresAt: null,
  maxClicks: null,
  active: true,
  ...patch
});

// Три бейджа в одном дереве, а не `rerender`: `rerender` из RenderResult подставляет элемент на
// ВЕРХ дерева, то есть снаружи `I18nProvider`, и второй вызов падал бы с «useI18n вне I18nProvider».
const Three = () => (
  <>
    <StatusBadge link={link()} now={NOW} />
    <StatusBadge link={link({ active: false })} now={NOW} />
    <StatusBadge link={link({ expiresAt: '2020-01-01T00:00:00Z' })} now={NOW} />
  </>
);

describe('StatusBadge', () => {
  it('бейдж рисует метку и тон для каждого из трёх статусов', () => {
    renderWithProviders(<Three />);
    expect(screen.getByText('Активна')).toHaveClass('badge', 'badge--active');
    expect(screen.getByText('Удалена')).toHaveClass('badge', 'badge--inactive');
    expect(screen.getByText('Истекла')).toHaveClass('badge', 'badge--expired');
  });

  it('метки трёх статусов переводятся на язык интерфейса', () => {
    localStorage.setItem('shortener.lang', 'en');
    renderWithProviders(<Three />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Deleted')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });
});
