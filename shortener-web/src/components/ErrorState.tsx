import { useI18n } from '../i18n/I18nProvider';

// Роль `alert` зафиксирована спекой (задача 11): ошибка загрузки списка и баннер 429 — единственные
// alert'ы на странице, и `getByRole('alert')` обязан находить ровно один узел.
// Кнопка подписана `detail.refresh`: «Обновить»/«Refresh» — единственная подходящая строка в
// словарях, а нового ключа задача 9 не заводит (паритет-тест задачи 7 краснеет на асимметрии).
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="state state--error" role="alert">
      <p>{message}</p>
      {retry ? (
        <button type="button" className="btn-ghost" onClick={retry}>
          {t('detail.refresh')}
        </button>
      ) : null}
    </div>
  );
}
