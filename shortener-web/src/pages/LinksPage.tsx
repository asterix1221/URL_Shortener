import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ApiFailure, CreateLinkPayload, LinkResponse, Page } from '../api/types';
import { createLink, deleteLink, listLinks } from '../api/links';
import { useAuth } from '../auth/useAuth';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LinkForm } from '../components/LinkForm';
import { LinksTable } from '../components/LinksTable';
import { Pager } from '../components/Pager';
import { Spinner } from '../components/Spinner';
import { useI18n } from '../i18n/I18nProvider';
import { errorKeyFor } from '../lib/errorKeys';
import { formatCount } from '../lib/format';
import { pushToast } from '../lib/toast';
import { useAsync } from '../lib/useAsync';

// Дефолт и потолок взяты с сервера: `LinkController.java:72-73` — `size` по умолчанию 20 с
// `@Min(1) @Max(100)`. URL-параметр вне этих границ не уходит запросом, иначе сервер ответил бы
// своим `400` на ссылку, которую кто-то просто дописал в адресной строке.
const DEFAULT_SIZE = 20;
const MAX_SIZE = 100;
const MIN_SIZE = 1;

/**
 * Номер страницы из URL: целое `>= 0` (сервер требует только `@Min(0)`), всё остальное — первая.
 * `Number(null)` — это `0`, а не `NaN`, поэтому отсутствующий параметр попадает в первую страницу
 * сам, а мусор вида `?page=abc` (`NaN`) отсекает проверка целочисленности.
 */
function readPage(raw: string | null): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/** Размер страницы: тот же `@Min(1)`, но с потолком — `?size=500` сервер отверг бы своим `400`. */
function readSize(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < MIN_SIZE) return DEFAULT_SIZE;
  return Math.min(parsed, MAX_SIZE);
}

// Пустой URL для первой страницы и размера по умолчанию: `/` пересылается без `?page=0&size=20`,
// чтобы адрес не обрастал значениями, которые сервер подставляет сам.
function paramsFor(page: number, size: number): URLSearchParams {
  const next = new URLSearchParams();
  if (page !== 0) next.set('page', String(page));
  if (size !== DEFAULT_SIZE) next.set('size', String(size));
  return next;
}

export default function LinksPage() {
  const { t, lang } = useI18n();
  const { token, handleUnauthorized } = useAuth();
  const [params, setParams] = useSearchParams();
  const [pending, setPending] = useState<LinkResponse | null>(null);
  const page = readPage(params.get('page'));
  const size = readSize(params.get('size'));

  // Гард 401 — до показа ошибки и ровно одна строка в каждом обработчике: подменённый токен обязан
  // выбросить на `/login?expired=1` (`e2e/session.spec.ts`), а не оставить список с баннером
  // «нужно войти». Остальные `!ok` к истёкшему сеансу не относятся: `client.ts` отдаёт `status: 0`
  // на сетевом сбое и пропускает 500/429 как есть.
  const guard = useCallback(
    (failure: ApiFailure): ApiFailure => {
      if (failure.status === 401) handleUnauthorized();
      return failure;
    },
    [handleUnauthorized]
  );

  const { state, run } = useAsync<Page<LinkResponse>>(async () => {
    const outcome = await listLinks(page, size, token ?? '');
    if (!outcome.ok) return { status: 'error', error: guard(outcome.error) };
    return { status: 'ready', data: outcome.data };
  }, [page, size, token, guard]);

  const submit = useCallback(
    async (payload: CreateLinkPayload): Promise<ApiFailure | null> => {
      const outcome = await createLink(payload, token ?? '');
      if (!outcome.ok) return guard(outcome.error);
      // после создания — `refetch` первой страницы, а не локальный prepend: порядок, `totalElements`
      // и статусы считает сервер, и вставка на второй странице разошлась бы с его ответом.
      // Ссылку отдаёт URL, поэтому правка `page=0` идёт через `setParams`, а не через состояние.
      if (page === 0) run();
      else setParams(paramsFor(0, size), { replace: true });
      return null;
    },
    [guard, page, run, setParams, size, token]
  );

  const remove = useCallback(
    async (code: string): Promise<void> => {
      const outcome = await deleteLink(code, token ?? '');
      setPending(null);
      if (outcome.ok) {
        // удаление — `204`, тела нет; список перезапрашивается, потому что сервер деактивирует
        // ссылку (`links.deleted`), а не вычёркивает её из выдачи
        pushToast('ok', 'links.deleted');
        run();
        return;
      }
      guard(outcome.error);
      pushToast('error', errorKeyFor(outcome.error, 'link'));
    },
    [guard, run, token]
  );

  // `.page` принадлежит `AppLayout` (строка 22), поэтому страница — фрагмент: второй `.page` внутри
  // `main` дал бы двойной padding и вложенный max-width, а обёртка-`div` увела бы панели из-под
  // ритма колонки, который задаёт `.page > main` (правило — только у прямых детей `main`).
  // `<LinkForm/>` рендерится вне зависимости от состояния списка: задача 13 проверяет гард по его
  // кнопке, а создание ссылки обязано оставаться возможным, пока список лежит.
  return (
    <>
      <LinkForm onSubmit={submit} />
      <section className="state">
        {state.status === 'loading' ? (
          // `aria-busy`, а не `role="status"`: единственный `role="status"` на странице принадлежит
          // контейнеру тостов (`Toasts`), второй сломал бы строгий локатор e2e
          <div aria-busy="true">
            <Spinner />
          </div>
        ) : state.status === 'error' ? (
          <ErrorState message={t(errorKeyFor(state.error, 'link'))} retry={run} />
        ) : (
          <>
            {/* счётчик берётся из `totalElements`, а не из длины `content`: на второй странице
                длина — это «сколько влезло», а не «сколько всего» */}
            <p>{t('links.count', { count: formatCount(state.data.totalElements, lang) })}</p>
            {state.data.content.length === 0 ? (
              <EmptyState>{t('links.empty')}</EmptyState>
            ) : (
              <LinksTable links={state.data.content} onRequestDelete={setPending} />
            )}
            <Pager
              page={state.data.number}
              pages={state.data.totalPages}
              size={size}
              first={state.data.first}
              last={state.data.last}
              onChange={(next) => setParams(paramsFor(next, size), { replace: true })}
            />
          </>
        )}
      </section>
      {pending !== null ? (
        <ConfirmDialog
          title={t('links.delete.title', { code: pending.code })}
          body={t('links.delete.body')}
          confirmLabel={t('links.delete.confirm')}
          cancelLabel={t('links.delete.cancel')}
          onConfirm={() => void remove(pending.code)}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </>
  );
}
