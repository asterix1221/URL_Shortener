# Заметки для собеседования

Ответы на вопросы, которые логично задать по этому проекту. Каждый ответ опирается на артефакт
репозитория — код, тест или отчёт с цифрами, из которых вывод следует, а не на память о прогоне.
Числа в отчётах пересчитаны из журналов (`docs/experiments/assets/`), способ пересчёта описан в
разделе «Как повторить» каждого отчёта.

## 1. Почему Base62 от sequence, а не хеш адреса? Что с коллизиями и предсказуемостью?

`LinkService.create` берёт следующий `id` из последовательности Postgres **до** вставки
(`LinkRepository.nextId`, [LinkService.java:105](../shortener-service/src/main/java/com/example/shortener/link/LinkService.java#L105))
и кодирует его алфавитом `0-9A-Za-z` (`Base62`). Коллизия невозможна по построению — id уникален, —
и не нужен цикл «сгенерировать → проверить занятость → повторить», который у хеша требует либо
лишнего `SELECT`, либо `INSERT` с перехватом нарушения уникальности. Плата — коды идут подряд, их
можно перечислить, а `GET /{code}` публичный и не лимитирован: «код знает только тот, кому его
дали» держится на неизвестности адреса, а не на защите. Лечится частично: `alias`
(`LinkServiceTest.rejectsTakenAlias` / `rejectsReservedAlias` / `rejectsMalformedAlias`, `409` и
`400`), `expiresAt`, `maxClicks` с `410 Gone` и уникальный индекс
`ux_links_code` ([V1__create_links.sql:10](../shortener-service/src/main/resources/db/migration/V1__create_links.sql#L10)).
Не сделано: солт в коде и лимитер на сам редирект — это в «Ограничениях» README.

## 2. Что произойдёт при падении Redis? Kafka? Как это проверено?

Redis — деградация в БД: `LinkCache` ловит `DataAccessException`, логирует, двигает
`shortener_cache_requests_total{result="error"}` и отвечает «нет в кэше», редирект остаётся 302.
Проверено тестами `LinkCacheTest.redisFailureCountsErrorAndFallsBack`, `putSurvivesRedisOutage`,
`evictSurvivesRedisOutage` и на живом Redis в `CacheIT.secondRedirectIsServedFromCache`, и руками
на стенде: `docker stop redis` → 302 за ≈0,43 с, счётчик `error` 0 → 2.0, после возврата Redis
счётчик `hit` продолжает расти ([docs/autotests.md](autotests.md), «Деградация при отказе Redis»).

Kafka — блок publish ограничен `max.block.ms=500`, исключение перехватывается, 302 уходит, событие
теряется. Тесты: `ClickEventPublisherTest.producerFailureIsSwallowedAndCounted`,
`brokerRejectionIsCountedInCallback`, `serializationFailureIsCountedAndNotSent`. Подложенный руками
факт: `shortener_clicks_publish_errors_total` вырос с 0.0 до 3.0 примерно **через 2 минуты** после
кликов, потому что срабатывает `delivery.timeout.ms` в callback — для алерта нужен период ≥ 2 мин,
иначе метрика «всё хорошо» врёт. Выключенный слушатель (`APP_CLICKS_CONSUMER_ENABLED=false`) не
теряет ничего: 10 редиректов → `LAG 10`, после включения `LAG 0` и `click_events` 6 → 16.

## 3. Как устроен cache-aside и какие у него риски (stampede, устаревание)?

Два ключа на ссылку — `link:<code>` (адрес клиенту) и `link-id:<code>` (id для события клика),
читаются одной `MGET`; TTL `min(app.cache.ttl-seconds, время до expiresAt)`; при удалении ссылки
снимаются оба ключа (`CacheIT.deleteEvictsCachedLink`) — другого способа изменить ссылку в API нет.
Риск №1 — stampede: защиты нет (ни лока, ни раннего протухания), и это не оговорка, а измеренное
состояние: прогрев холодного кэша отдельным прогоном на 644 RPS дал 43,79 % KO у генератора,
`pending` HikariCP 192 и `inflight` 200 ([06-soak.md](experiments/06-soak.md)); в baseline тот же
эффект назван «кэш не спасает от холодного старта» ([docs/baseline.md](baseline.md)). Риск №2 —
устаревание: ограничено TTL и `evict`; ссылки с `maxClicks` не кэшируются вообще, потому что их
доступность живёт в счётчике БД
(`LinkCacheTest.linkWithMaxClicksIsNotCached`, `CacheIT.linkWithClickLimitIsNotCached`). Риск №3 —
отказ Redis: см. вопрос 2. Плюс собственная реализация вместо `@Cacheable` — это ещё и выключатель
`APP_CACHE_ENABLED`, на котором построен эксперимент 7.1.

## 4. Как гарантируется лимит `maxClicks` при конкурентных запросах?

Не «прочитать и проверить», а условный атомарный `UPDATE ... SET click_count = click_count + 1
WHERE id = :id AND active AND (expires_at IS NULL OR expires_at > now()) AND (max_clicks IS NULL OR
click_count < max_clicks)` ([LinkRepository.java:47](../shortener-service/src/main/java/com/example/shortener/link/LinkRepository.java#L47)):
ноль обновлённых строк означает «исчерпано» и даёт `410`. Сериализацию делает Postgres на строке, в
приложении блокировок нет. Тест `ConcurrentClickIT`: 20 параллельных кликов по ссылке с
`maxClicks=5` дают ровно 5 × `302` и 15 × `410`, `click_count` = 5. Что тест действительно ловит
гонку, показано мутацией: замена на «прочитал → проверил → записал» даёт **14 × 302** вместо 5, а
последовательные IT остаются зелёными ([docs/test-validation.md](test-validation.md), «Мутация 2»).
Безлимитные ссылки строку `links` на переход не трогают — иначе все клики горячей ссылки встают в
очередь на обновление одной строки.

## 5. Как устроена архитектура автотестов и как ты боролся с флейками?

Чёрный ящик: только HTTP, без Spring и без доступа к базе. Слои — `base/BaseApiTest` (`baseUrl` из
`-DbaseUrl`, `followRedirects=false`, общий Jackson, хелперы `newUser/tokenFor/createLinkOk`),
`api/*` (по методу на эндпоинт, каждый под `@Step`), `model/` (record'ы), `data/TestData`
(DataFaker + UUID), `resources/schemas/` (JSON Schema контрактов); 38 тестов = 6 `smoke` +
32 `regression` ([docs/autotests.md](autotests.md), «Структура» и «Матрица покрытия»). Флейки
лечились по причине, а не ретраями (их в сьюте нет намеренно): (1) аналитика приходит из Kafka
позже ответа — Awaitility с паузами (`RedirectTests.java:47` — до 20 с, `StatsTests.java:51` и
`:69` — до 15 с) вместо `sleep`; (2) общее состояние — каждый тест регистрирует своего пользователя
и свои ссылки, поэтому классы и методы можно перемешивать; (3) `429` от лимитера — в
`infra/.env.example` стоит `RATE_LIMIT_CREATE_PER_MINUTE=1000` при дефолте compose 10, иначе сьют
этапа 4 падал на одиннадцатом создании; (4) окружение — в CI стек поднимается и снимается внутри
сборки (`down -v` в `post: always`, [docs/ci-jenkins.md](ci-jenkins.md)), поэтому прогон не зависит
от состояния, оставшегося от предыдущего.

## 6. Как найден дефект с индексом? Покажи `EXPLAIN`.

С гипотезой, записанной до прогонов, и диагнозом вслепую: уровень опущен до 1 RPS, чтобы стоимость
агрегата не тонула в очереди, и смотрели не текст миграции, а счётчики планов. В дефекте
`Δidx_scan` 180 → 0 и `Δseq_scan` 0 → 537–540 при тех же 60 запросах на прогон
([04-missing-index.md](experiments/04-missing-index.md)). В `EXPLAIN (ANALYZE, BUFFERS)` тот же
переход виден на одном запросе: baseline — `Parallel Index Only Scan using ix_click_events_link_ts`,
`Execution Time: 26.231 ms`; с дефектом — `Parallel Seq Scan on click_events`,
`Rows Removed by Filter: 3 160 865`, `Execution Time: 302.805 ms`
(`docs/experiments/assets/explain-baseline1.txt` против `explain-missing1.txt`). Порядок
неподделываемый: коммит с диагнозом `7df09ab` предшествует коммиту, вскрывшему
`V90__drop_click_events_index.sql`, — `37d763d`. Неприятная часть: с дефектом эндпоинт стал
*быстрее* (медиана p95 1 582 → 1 127 мс), потому что индексный путь у `clicksByDay` однопоточный и
со `external merge Disk: 2944kB`; гипотеза «x5 хуже» не подтвердилась ни в какую сторону, и это
оставлено в отчёте как есть.

## 7. Что было первым узким местом при stress и как ты это доказал?

Не HTTP-тракт и не пул, а слушатель `click-events`: лаг консьюмера отличен от нуля уже с +180 с
разгона, тогда как `pending` пула и `inflight = 200` (потолок томкатных потоков) появляются через
150 с **после** точки деградации 1074 RPS. Доказательство — вмешательство, а не догадка: тот же
образ и тот же разгон при `concurrency` 1 → 3 дают KO 13 589 из 615 000 (2,21 %, `exit=1`) →
**KO 0** (`exit=0`), а в единственной честной полосе +420…+570 с медиана p95 276,0 → 79,0 мс
([05-stress.md](experiments/05-stress.md), шаги 3–5). Второе доказательство — негативное: отказ на
верху серии оказался транспортным, а не сервисным — в логе шлюза нет ни `500`, ни `502`, ни `504`,
а в разбивке KO `PrematureCloseException` 69,77 % и `ConnectException` 30,23 %. Что узкое место
живёт именно в слушателе, видно и в soak: рост дна кучи (4,565 МиБ/мин) на 97 % объясняется
приёмными fetch-буферами Kafka и совпадает с лагом (r = 0,975).

## 8. Чем отличаются load / stress / spike / soak и зачем каждый?

**Load** (`constant`, фиксированные уровни) — сравнение вариантов между собой: 7.1 кэш, 7.2 пул,
7.3 режим кликов; вывод годится только если интервалы прогонов не пересекаются. **Stress**
(`ramp`) — искать не «максимальный RPS», а порядок отказа: что начинает болеть первым (7.5: лаг
раньше пула), и где перестаёт догонять собственную очередь. **Spike** — 10× базы на фиксированные
30 с (`LoadParams.openModel`, [LoadParams.java:71](../shortener-loadtests/src/test/java/sim/LoadParams.java#L71));
профиль реализован, но на этом стенде как отдельный эксперимент **не замерялся** — сказать про него
нечего, кроме поведения кода. **Soak** — долго на ~60 % от точки деградации (644 RPS), чтобы
отличить тренд от шума: тренд дна кучи, дрейф p99, соответствие счётчиков, дренаж лага
([06-soak.md](experiments/06-soak.md)); здесь он сделан за 15 минут вместо 60–120 по согласию,
поэтому вывод «медленной утечки нет» на этом горизонте не делается.

## 9. Почему результаты нельзя напрямую сравнивать с чужими стендами?

Генератор нагрузки и весь тестируемый стек живут на одной машине: Gatling, Docker VM, сервис,
Postgres, Redis, Kafka, Prometheus и Grafana делят четыре ядра, приложение ограничено `cpus: "2"` и
`mem_limit: 1g` ([docs/baseline.md](baseline.md), «Ограничения методики»;
[infra/docker-compose.yml:83](../infra/docker-compose.yml#L83)). Значит абсолютные RPS и мс —
свойство этого стенда, а переносимы только отношения внутри одного прогона и зафиксированные до
запуска критерии. Худший случай зафиксирован явно: ступенчатая серия 7.1b отменена целиком, потому
что на 1500+ RPS Gatling показывал p50 111 с там, где сервис насчитал максимум 5,6 с, а фактический
`Cnt/s` упал до 433–460 при цели 2000–2500 ([01-redis-vs-no-cache.md](experiments/01-redis-vs-no-cache.md),
ограничение 1). Даже прогретое/непрогретое состояние одного и того же образа меняет вывод: первый
прогон после подъёма VM дал KO 51,30 % и p95 9998 мс, третий прогрев — KO 0,00 % и p95 15 мс.
