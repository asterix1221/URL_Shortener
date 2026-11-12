import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

// Экран живёт под `RequireAuth` (см. App.tsx): аноним на неизвестном пути уходит на вход, поэтому
// сюда попадает только вошедший — отсюда отсутствие запросов к API и состояний загрузки.
export default function NotFoundPage() {
  const { t } = useI18n();

  return (
    <section className="state">
      <h1>{t('page.notFound')}</h1>
      <Link to="/">{t('page.notFound.action')}</Link>
    </section>
  );
}
