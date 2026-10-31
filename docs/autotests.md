# API-автотесты: как устроены и что показали

Проект `shortener-autotests` — чёрный ящик: HTTP-запросы к поднятому сервису, без Spring и без
доступа к базе. Стек: REST Assured, JUnit 5, AssertJ, DataFaker, Awaitility, JSON Schema, Allure.

## Запуск

```powershell
docker compose -f infra\docker-compose.yml --env-file infra\.env up -d --build   # стек
cd shortener-autotests
.\mvnw.cmd test "-DbaseUrl=http://localhost:8080" "-Dgroups=smoke"
.\mvnw.cmd test "-DbaseUrl=http://localhost:8080" "-Dgroups=regression"
.\mvnw.cmd allure:report      # target/site/allure-maven-plugin
.\mvnw.cmd allure:serve       # отчёт в браузере
```

Если порт 8080 занят (на этой машине на нём Jenkins), приложение поднимается на `APP_PORT`
из `infra/.env` — здесь `28080`, и `baseUrl` указывает туда же.

## Стек для автотестов

`docker compose -f infra\docker-compose.yml --env-file infra\.env up -d --build` поднимает
Postgres и приложение (`shortener-service/Dockerfile`). Порт хоста задаёт `APP_PORT` из
`infra/.env`, потому что 8080 на этой машине занят Jenkins.

Отступление от плана в Dockerfile: шаг `dependency:go-offline` убран. На холодном кэше он
не завершался дольше часа (резолвит все плагины и test-зависимости), поэтому слой с ним
блокировал сборку образа. Тот же эффект даёт `--mount=type=cache,target=/root/.m2`: каталог
переживает пересборку, повторная сборка берёт артефакты из кэша билдера.

## Структура

| Слой | Назначение |
|---|---|
| `base/BaseApiTest` | `baseUrl` из `-DbaseUrl`, `followRedirects=false`, общий Jackson (JSR-310), фильтр Allure, хелперы `newUser/tokenFor/createLinkOk`, единая проверка контракта ошибки |
| `api/AuthApi`, `api/LinksApi` | по одному методу на эндпоинт, каждый помечен `@Step`; в тестах нет ни URL, ни JSON-строк |
| `model/` | record'ы запросов/ответов, `@JsonInclude(NON_NULL)` |
| `data/TestData` | билдеры уникальных данных (DataFaker + UUID), слабый пароль, зарезервированный и невалидный alias, слишком длинный url |
| `resources/schemas/` | `link-response`, `error-response`, `stats-response`, `auth-response` |

Каждый тест регистрирует своего пользователя и свои ссылки — общих состояний нет, поэтому
классы и методы можно перемешивать.

## Матрица покрытия

38 тестов: 6 `smoke`, 32 `regression`.

| Эндпоинт | Позитив | Негатив |
|---|---|---|
| `POST /api/auth/register` | 201 | 400 слабый пароль, 400 плохой email, 409 дубликат |
| `POST /api/auth/login` | 200 + JWT (schema) | 401 неверный пароль, 401 нет пользователя, 400 пустое тело |
| `POST /api/links` | 201 без alias / с alias / с `expiresAt` / с `maxClicks`, ссылка в списке владельца | 400 ftp, пустой, >2048, `expiresAt` в прошлом, зарезервированный alias, плохие символы alias, 409 занятый alias, 401 без токена |
| `GET /{code}` | 302 + `Location` | 404 нет кода, 410 просрочена, 410 после удаления, 410 лимит кликов |
| `GET /api/links/{code}` | 200 | 403 чужая, 404 |
| `DELETE /api/links/{code}` | 204, затем `active=false` | 403 чужая |
| `GET /api/links/{code}/stats` | 200 пустая, счётчик растёт, Referer в `topReferrers` | 403 чужая, 401 без токена |
| `GET /api/links` | 200 страница | 401 без токена, 400 `size=101` |
| любой защищённый | — | 401 испорченный токен |

Негативные тесты проверяют не только код, но и контракт `ApiError`: `status`, `error`, `message`,
`path` + JSON-схема `error-response.json`. Позитивные проходят свои схемы, поэтому переименование
поля в сервисе ломает тест, а не «незамеченно проходит».

## Результаты проверок

| Проверка | Результат |
|---|---|
| Стек (`up -d --build`) | приложение в контейнере, `/actuator/health` → UP |
| `smoke` против контейнера | 6 тестов, 12,8 с (правило «меньше минуты» выполнено) |
| весь набор против контейнера | 38/38 зелёные за 16,2 с |
| 10 прогонов `regression` подряд | 10/10 зелёные |
| 3 намеренные поломки сервиса | пойманы: 18, 4+12 и 3 падения; после отката — 38/38 зелёные |
| Случайный порядок (3 прогона, семена `101/202/303`) | зелёные |
| Параллельный запуск (`junit-platform.properties`) | 14,0 с на 32 теста |
| Последовательный (`-Djunit.jupiter.execution.parallel.enabled=false`) | 19,1 с |
| Allure | `@Epic`/`@Feature`, `@Step` на вызовах API, к каждому шагу приложены Request/Response |

Замеры — время полного `mvnw test`, поэтому в обе цифры входит ~8–10 с на старт Maven и JVM.
Разница 14,0 с против 19,1 с — это ~5 с экономии на 32 тестах, то есть параллельность ускоряет
полезную часть прогона примерно вдвое (5 с против 10 с).

### Замеченное при настройке

- `ClassOrderer$Random` и `MethodOrderer$Random` по умолчанию используют фиксированное семя,
  поэтому «случайный» порядок повторяется от прогона к прогону. Порядок реально перемешивается
  только с `-Djunit.jupiter.testmethod.order.random.seed=...`.
- `net.datafaker` не документирован как потокобезопасный, а тесты конкурентные — инстанс лежит
  в `ThreadLocal`.
- JsonPath REST Assured по умолчанию включает режим `$.`-синтаксиса, поэтому `body("$.content.code", …)`
  возвращает `null`, а `body("content.code", …)` работает.
- `io.qameta.allure:allure-junit5` в 2.35.x переименован в `allure-jupiter` — подключён новый artifact.

## CI (GitHub Actions)

`.github/workflows/autotests.yml`: push в `main` и pull request. Шаги — чистый
`infra/.env` из примера, `docker compose up -d --build`, ожидание `/actuator/health`,
`./mvnw -B -q verify` в сервисе, `./mvnw -B test` автотестов против контейнера,
`allure:report` и загрузка доклада артефактом.

| Прогон | Коммит | Итог |
|---|---|---|
| #1 (`actions/runs/41231657968`) | `d2b9cab` | failure за 27 с: exit 1 на старте стека, exit 126 на шаге Allure, предупреждение «No files were found with the provided path: shortener-autotests/target/site/allure-maven-plugin», артефактов нет |
| #2 (`actions/runs/41231896819`) | `04603dd` | success; артефакт `allure-report`, 1,6 МБ |
| #3 (`actions/runs/41232694633`) | `668fd49` (уже после переписывания истории) | success; артефакт `allure-report`, 1,6 МБ |
| #4 (`actions/runs/41233079126`) | `431fd22` | success; артефакт `allure-report`, 1,6 МБ — финальная проверка актуального `main` |

Причина падения #1 — отсутствие бита исполнения у `mvnw` в индексе (режим 100644).
На Windows `core.fileMode=false`, поэтому `chmod +x` не фиксировался, а на ubuntu-latest
`checkout` даёт неисполняемый файл: `./mvnw` внутри Dockerfile не запускается, сборка
образа и `compose up -d --build` падают (exit 1), и сам шаг `./mvnw allure:report` даёт
126. Исправлено `git update-index --chmod=+x` для обоих `mvnw` (содержимое файлов не
менялось — blob тот же).

Хеш `d2b9cab` и `04603dd` — коммиты до переписывания истории (рабочие документы были
вынесены из репозитория); сами прогоны #1 и #2 остались в списке Actions по старым ссылкам.

Бейдж статуса — в начале `README.md`. `api.github.com` с этой машины недоступен (таймаут),
`gh` CLI не установлен, поэтому статус прогонов читался по страницам
`github.com/<owner>/<repo>/actions/runs/<id>` и по SVG-бейджу, а не через REST API.

## Использованные версии

| Библиотека | Версия | Почему не «самая свежая» |
|---|---|---|
| REST Assured, json-schema-validator | 5.5.7 | `allure-rest-assured` 2.35.5 собирается против линии 5.x; 6.x — другая мажорная версия с непроверенным фильтром |
| JUnit (bom) | 5.14.4 | 6.x ещё не поддерживается Allure-плагином 2.x |
| AssertJ | 3.27.7 | 4.x — milestone-релизы, они запрещены правилами плана |
| Allure (bom) | 2.35.5 | 3.0.x — новый мажор с другим форматом результатов |
| Allure CLI (`reportVersion`) | 2.46.1 | самый свежий стабильный CLI, скачивается плагином |
| DataFaker | 2.5.4 | стабильная линия 2.5.x |
| Awaitility | 4.3.0 | |
| Jackson (bom) | 2.19.0 | та же линия, что у Spring Boot 3.5, чтобы сериализация клиента и сервера совпадала |
| AspectJ weaver | 1.9.24 | нужен `@Step`; 1.9.26 — та же линия, взята проверенная |
| maven-surefire-plugin | 3.5.6 | |

## Валидация тестов намеренными поломками

Поломки вносились в рабочий каталог, ловились автотестами и откатывались (`git checkout`);
в историю коммитов не попали.

| Поломка сервиса | Падений автотестов | Комментарий |
|---|---|---|
| `POST /api/links` отвечает 200 вместо 201 | 18 из 38 | все позитивные сценария создания плюс тесты, которые создают ссылку через `createLinkOk` |
| из ответа `LinkResponse` убрано поле `code` | 4 падения + 12 ошибок | срабатывают JSON-схема `link-response.json` и `hasItem(code)` в списке владельца |
| отключена проверка владельца в `LinkService.requireOwned` | 3 из 38 | `SecurityTests.foreignLinkIsNotReadable`, `SecurityTests.foreignLinkIsNotDeletable`, `StatsTests.statsOfForeignLinkAreForbidden` — все с «Expected status code <403> but was <200>» |

Прогон третьей поломки: сервис поднят локально на 28081 с временно удалённой проверкой,
`mvnw -B test -DbaseUrl=http://localhost:28081` → `Tests run: 38, Failures: 3, Errors: 0`,
`BUILD FAILURE`. После `git checkout` файла и перезапуска тот же прогон дал
`Tests run: 38, Failures: 0, Errors: 0`, `BUILD SUCCESS` за 13,4 с; `git diff shortener-service/src`
пуст. Правка жила только в рабочем каталоге.

Падает ровно тот набор, который отвечает за разграничение доступа: 403-кейсы для чтения чужой
ссылки, её удаления и статистики. Остальные 35 тестов зелёные — то есть сьют не «валится целиком»
от любой правки, а указывает на конкретное нарушенное правило.

## Этап 5: кэш, асинхронные клики, rate limit

Юнит + интеграционные (`cd shortener-service; .\mvnw.cmd clean verify`): **73 юнит-теста и
19 интеграционных, BUILD SUCCESS**, покрытие по строкам JaCoCo **90,0%** (правило ≥ 80% выполняется).
Цифра снята с `clean verify`: более ранние 91,1% получались по `jacoco.exec`, накопленному между
прогонами без очистки, к `clean`-прогону он не относится.

| Класс IT | Тестов | Что проверяет |
|---|---|---|
| `CacheIT` | 3 | второй редирект обслужен кэшем (значение, TTL, счётчик `hit`; из БД URL изменён напрямую — редирект всё равно отдаёт старый), `DELETE` вычищает оба ключа, ссылка с `maxClicks` не кэшируется |
| `RateLimitIT` | 2 | 11-й (при лимите 2 — 3-й) `POST /api/links` → 429 с `Retry-After`, лимит per-user, а не global |
| `LinkLifecycleIT` | 5 | TTL, `maxClicks`, удаление, отчёт по кликам |
| `ConcurrentClickIT` | 1 | 20 параллельных кликов по ссылке с лимитом |
| `SchemaMigrationIT` | 3 | Flyway V1–V4 |
| `SecurityIT` | 5 | JWT, роли, 401/403 |

Инфраструктура в IT поднимается Testcontainers'ами: Postgres 16, `redis:7`,
`apache/kafka:3.9.1`. Отступление от плана (п. 5.1 требовал Kafka 3.9.0): образ `apache/kafka:3.9.0`
с конфигом, который генерирует Testcontainers, не стартует — в `listeners` есть
`CONTROLLER://0.0.0.0:9094`, а в `advertised.listeners` контроллерского адреса нет, и брокер
падает на валидации «advertised.listeners cannot use the nonroutable meta-address 0.0.0.0»
(проверено тремя `docker run` с разным набором переменных). В 3.9.1 та же конфигурация доходит до
`RECOVERY → RUNNING`. Паттерн зафиксирован и в `infra/docker-compose.yml`.

### Проверка на живом стеке

Стек: `APP_PORT=28080`, образ пересобран из кода этапа 5.

**Кэш (cache-aside).** Три клика по коду `Q8I` → `shortener_cache_requests_total{result="miss"} 1.0`,
`{result="hit"} 2.0`. В Redis: `GET link:Q8I` = целевой URL, `TTL link:Q8I` = 3599,
`GET link-id:Q8I` = id ссылки — то есть для редиректа и события клика БД больше не запрашивается.

**Асинхронные клики.** После 3 кликов в `click_events` 3 строки. Consumer выключен
(`APP_CLICKS_CONSUMER_ENABLED=false`): 10 редиректов, в `click_events` по-прежнему 6 строк, а
`kafka-consumer-groups.sh --describe --group click-writer` показывает `LAG 10` на партиции 2
(события с одним `linkId` key'уются вместе — все попадают в одну партицию). После включения
консьюмера: `CURRENT-OFFSET 16 / LOG-END-OFFSET 16 / LAG 0`, `click_events` 6 → 16. Ничего не
потерялось.

**Деградация при отказе Redis.** `docker stop redis` → редиректы остаются 302, время отклика
≈0,43 с (поход в БД), `shortener.cache.requests{result="error"}` 0 → 2.0. После старта Redis
счётчик `hit` продолжает расти (2.0 → 3.0). Приложение не падает и не отдаёт 5xx.

**Деградация при отказе Kafka.** `docker stop kafka` → редиректы 302 за 11–22 мс: `max.block.ms=500`
не даёт продусеру блокировать запрос. `shortener_clicks_publish_errors_total` вырос с 0.0 до 3.0
примерно через **2 минуты** после кликов — это `delivery.timeout.ms` (по умолчанию 120 с) срабатывает
асинхронно в callback, а не в момент запроса. Проверять эту метрику сразу после кликов бессмысленно;
для алерта нужен период ≥ 2 мин.

**Rate limit.** `RATE_LIMIT_CREATE_PER_MINUTE=10`: десять `201`, одиннадцатый — `HTTP/1.1 429` с
`Retry-After: 5` и сообщением про слишком много созданий ссылок. В `.env` для автотестов стоит 1000
(см. комментарий в `infra/.env.example`), иначе сьют этапа 4 начал бы падать на 429.

**Удаление и лимит кликов.** `EXISTS link:<code>` 1 → `DELETE` 204 → `EXISTS` 0 → следующий клик 410
(кэш не «прогревается» ошибочным ответом). Ссылка с `maxClicks=3`: `302 302 302 410`, оба ключа
Redis отсутствуют (`maxClicks`-ссылки не кэшируются — иначе счётчик в БД отстал бы от кэша),
`click_count` = 3.

**Метрики.** `/actuator/prometheus` отдаёт `http_server_requests_seconds_bucket` (345 строк
лейблов — гистограмма перцентилей включена), `shortener_cache_requests_total`,
`shortener_clicks_publish_errors_total`, `hikaricp_connections`, `jvm_memory_used_bytes` и
`kafka_consumer_fetch_manager_records_lag` по партициям 0/1/2 — последняя появляется бесплатно,
Kafka-клиент сам регистрирует своего Micrometer-коллектора, отдельный `MicrometerConsumerListener`
не подключали.

**Регресс.** Автотесты этапа 4 запущены без изменений: `Tests run: 38, Failures: 0, Errors: 0`,
`BUILD SUCCESS` (п. 5.8 плана — сьют не должен правиться).

### Где смотреть результаты

`.github/workflows/service-tests.yml` на каждом push и PR гоняет `./mvnw -B verify`, печатает
таблицу «юнит / интеграционные / покрытие» в сводку прогона (`scripts/test-report-summary.py`),
кладёт HTML-отчёт JaCoCo и XML-протоколы тестов в артефакты `service-coverage` и
`service-test-reports`, а на `main` обновляет `docs/coverage.json` — из него рисуется бейдж
покрытия в `README.md`. Локально та же таблица: `python scripts\test-report-summary.py
shortener-service\target docs\coverage.json`.

## Проверка gateway (nginx)

Стек с `gateway` на `nginx:1.30.6` (`APP_PORT=28080 → 80`), у приложения порт наружу не
публикуется (`docker ps`: `infra-app-1 → 8080/tcp`, без проброса; `infra-gateway-1 →
0.0.0.0:28080->80/tcp, Up (healthy)`).

| Проверка | Реальный результат |
|---|---|
| `scripts/smoke.ps1 -BaseUrl http://localhost:28080` | `no token: 401`, `created: Q8q → http://localhost:28080/Q8q`, `redirects: 302 302 410`, `totalClicks: 2` |
| Автотесты этапа 4 против gateway, без изменений | `Tests run: 38, Failures: 0, Errors: 0` (Auth 9, Redirect 5, Security 6, Stats 6, LinkCreate 12), BUILD SUCCESS за 15,5 с |
| Клиентский IP (`server.forward-headers-strategy: native`) | клик с `X-Forwarded-For: 198.51.100.9` → в `click_events.ip_hash` `562c574e19…731d9`, что ровно SHA-256 от `198.51.100.9` + соль; клик без заголовка → `b2e532a6b5…6b7063` = хостовый адрес моста Docker (`172.21.0.1`), он же видно в `gateway.log` |
| Метрики снаружи | `GET /actuator/prometheus` через gateway → 403 (`access forbidden by rule` в логе nginx); из контейнера gateway на `http://app:8080/actuator/prometheus` → 200 |
| Тело запроса | POST с телом ~30 КБ → 413 ещё до сервиса (`client_max_body_size 16k`) |
| Health | `GET /actuator/health` → `{"status":"UP"}`, `GET /gateway-health` → `ok` (healthcheck контейнера) |
| OpenAPI через прокси | `/v3/api-docs` → `servers[0].url = http://localhost:28080` |

Разбор двух мест, где прокси меняет поведение приложения:

- **Порт в OpenAPI.** Сначала был `http://localhost` без порта. Причина:
  `forward-headers-strategy: native` заставляет Tomcat брать порт из `X-Forwarded-Port`, а при
  его отсутствии — порт схемы по умолчанию (80), и `Host: localhost:28080` уже не спасает. Лечится `map $http_host` в nginx:
  порт берётся из заголовка Host клиента, при `listen 443` так же сработает `$server_port`.
  `$host` для `proxy_set_header Host` не подходит — он обрезает порт.
- **IP клиента в статистике.** Без `X-Forwarded-For` все клики записались бы с адресом контейнера
  nginx (`172.21.0.5`); таблица выше показывает, что хеш считается от адреса клиента.
  Подделать заголовок снаружи нельзя: Tomcat применяет `X-Forwarded-*` только когда запрос пришёл
  от внутреннего адреса, а снаружи приложение больше не доступно — порт не публикуется.

Логи gateway пишутся в формате с `$request_time` и `$upstream_response_time`
(`/var/log/nginx/gateway.log`), иначе «тормозит прокси или сервис» не разделить:
`172.21.0.1 - GET /Q8r HTTP/1.1 "302" 0.021 s upstream=172.21.0.5:8080 upstream_time=0.020` и
тот же код на кэш-хите `0.007 s`.
