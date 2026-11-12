// Один литерал на три места: его кладёт `handleUnauthorized`, его читает `LoginPage` через
// `useSearchParams().get('expired')`, его ждёт `toHaveURL(/\/app\/login\?expired=1$/)` в e2e
// задачи 15. Флаг в URL, а не в `location.state`: state теряется при перезагрузке, а сообщение
// «сессия истекла» после случайного F5 должно остаться.
export const EXPIRED_REDIRECT = '/login?expired=1';
