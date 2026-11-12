import { Route, Routes } from 'react-router-dom';
import { RedirectIfAuthed, RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import LinkDetailPage from './pages/LinkDetailPage';
import LinksPage from './pages/LinksPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';

// Таблица собирается композицией, без `Outlet`: `AppLayout` принимает `children`, и каждая ветка
// оборачивает свою страницу явно.
//
// Гард по спеке — «без токена любой путь, кроме /login», поэтому `*` тоже внутри `RequireAuth`:
// аноним, пришедший на несуществующий адрес, попадает на вход, а 404 видит только вошедший.
export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <AppLayout>
            <RedirectIfAuthed>
              <LoginPage />
            </RedirectIfAuthed>
          </AppLayout>
        }
      />
      <Route
        path="/"
        element={
          <AppLayout>
            <RequireAuth>
              <LinksPage />
            </RequireAuth>
          </AppLayout>
        }
      />
      <Route
        path="/links/:code"
        element={
          <AppLayout>
            <RequireAuth>
              <LinkDetailPage />
            </RequireAuth>
          </AppLayout>
        }
      />
      <Route
        path="*"
        element={
          <AppLayout>
            <RequireAuth>
              <NotFoundPage />
            </RequireAuth>
          </AppLayout>
        }
      />
    </Routes>
  );
}
