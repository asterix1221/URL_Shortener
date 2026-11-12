# Диаграммы работы системы

Набор отдельных Mermaid-диаграмм: каждая покрывает свой аспект работы URL Shortener. Формат —
Mermaid внутри `.md` (GitHub рендерит нативно). Подписи русские, имена сущностей — как в коде;
в конце каждого файла раздел «Источники» со ссылками `файл:строка`. Факты сверены с текущим `main`
(включая интерфейс этапа 9).

| Файл | Что показывает | Тип |
|---|---|---|
| [01-context.md](01-context.md) | C1: акторы и внешние системы, система одним блоком | flowchart |
| [02-containers.md](02-containers.md) | C2: контейнеры compose, порты, протоколы, лимиты, профили | flowchart |
| [03-components.md](03-components.md) | C3: компоненты Spring Boot и их связи | flowchart |
| [04-seq-redirect.md](04-seq-redirect.md) | Редирект GET /{code}: кэш, guard лимита, 404/410, деградация | sequence |
| [05-seq-create.md](05-seq-create.md) | Создание ссылки: JWT, rate limit, валидация, Base62/алиас | sequence |
| [06-seq-clicks-async.md](06-seq-clicks-async.md) | Асинхронные клики через Kafka, режим sync, лаг консьюмера | sequence |
| [07-state-link.md](07-state-link.md) | Жизненный цикл ссылки: ACTIVE/EXPIRED/EXHAUSTED/DELETED | state |
| [08-er-schema.md](08-er-schema.md) | Схема БД: users, links, click_events, индексы, link_seq | er |
| [09-auth-session.md](09-auth-session.md) | Регистрация/вход, JWT и сессия SPA, обработка 401 | sequence |
| [10-web-delivery.md](10-web-delivery.md) | Доставка SPA: маршруты шлюза, кэш ассетов, сборка образа | flowchart |
| [11-metrics.md](11-metrics.md) | Поток метрик и 10 панелей дашборда Grafana | flowchart |

Проверка рендера: все 12 mermaid-блоков набора (в `10-web-delivery.md` их два) извлечены в отдельные
`.mmd` и прогнаны `npx -y @mermaid-js/mermaid-cli` — каждый блок exit 0 + ненулевой SVG. Сводный гейт
по всему набору выполняется перед коммитом.