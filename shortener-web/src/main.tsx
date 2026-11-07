import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { I18nProvider } from './i18n/I18nProvider';
import './styles/tokens.css';
import './styles/base.css';

// `basename` читается из конфига сборки единственном месте: `base` задан и в `vite.config.ts`,
// и в `vitest.config.ts`, поэтому `/app/` в href ссылок и в редиректах гардов приходит оттуда,
// а не продублирован в коде строк.
//
// `AuthProvider` стоит ВНУТРИ роутера, а не снаружи: он зовёт `useNavigate` (гард 401 в
// `handleUnauthorized`), и вне контекста роутера этот хук бросает на первом же рендере.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>
);
