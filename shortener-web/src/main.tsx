import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { I18nProvider } from './i18n/I18nProvider';
import './styles/tokens.css';
import './styles/base.css';

// `basename` приходит из конфига сборки и только оттуда: `base` задан и в `vite.config.ts`, и в
// `vitest.config.ts`, поэтому `/app/` в href ссылок и в редиректах гардов не продублирован в коде
// строкой.
//
// `AuthProvider` стоит ВНУТРИ роутера, а не снаружи: он зовёт `useNavigate` (`AuthProvider.tsx:14`)
// на каждом рендере, и вне контекста роутера этот хук бросает — страница была бы белой ещё до
// первого запроса. Ловушка тем опаснее, что `main.tsx` исключён из замера покрытия, так что ни
// один тест этот порядок не проверяет.
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
