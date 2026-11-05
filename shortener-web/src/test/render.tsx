import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n/I18nProvider';

const BASE = import.meta.env.BASE_URL;

// Память роутера живёт в терминах адресной строки (с /app/), а тесты пишут маршруты как в
// таблице App.tsx (без него) — здесь единственное преобразование между ними.
function toEntry(path: string): string {
  return path.startsWith(BASE) ? path : `${BASE}${path.replace(/^\/+/, '')}`;
}

function WithProviders({ children, path }: { children: ReactNode; path: string }) {
  return (
    <I18nProvider>
      <MemoryRouter basename={BASE} initialEntries={[toEntry(path)]}>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    </I18nProvider>
  );
}

export function renderWithProviders(ui: ReactElement, path = '/'): RenderResult {
  return render(<WithProviders path={path}>{ui}</WithProviders>);
}

// renderHook принимает только children, поэтому отдельная обёртка без ui-слота.
export function AuthProviderWrapper({ children }: { children: ReactNode }) {
  return <WithProviders path="/">{children}</WithProviders>;
}
