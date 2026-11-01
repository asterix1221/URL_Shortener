# URL Shortener с аналитикой

[![autotests](https://github.com/asterix1221/URL_Shortener/actions/workflows/autotests.yml/badge.svg)](https://github.com/asterix1221/URL_Shortener/actions/workflows/autotests.yml)
[![service-tests](https://github.com/asterix1221/URL_Shortener/actions/workflows/service-tests.yml/badge.svg)](https://github.com/asterix1221/URL_Shortener/actions/workflows/service-tests.yml)
![coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/asterix1221/URL_Shortener/main/docs/coverage.json)

Сервис сокращения ссылок на Spring Boot: редирект, JWT-аутентификация, статистика кликов,
лимиты и TTL ссылок, кэш Redis, асинхронная запись кликов в Kafka, Prometheus/Grafana,
API-автотесты (REST Assured + Allure) и нагрузочные сценарии (Gatling).

## Быстрый старт (три шага)

Нужны Docker Desktop, Java 21+ и PowerShell 7.

```powershell
# 1. поднять стек: gateway nginx + Postgres + Redis + Kafka + приложение
Copy-Item infra\.env.example infra\.env
docker compose -f infra\docker-compose.yml --env-file infra\.env up -d --build

# 1b. мониторинг для нагрузочных прогонов — отдельный профиль (в CI не поднимается)
docker compose -f infra\docker-compose.yml --env-file infra\.env --profile monitoring up -d

# 2. (опционально) запуск сервиса локально с hot reload, вместо контейнера
$env:JWT_SECRET = "dev-secret-dev-secret-dev-secret-123456"
cd shortener-service; .\mvnw.cmd spring-boot:run

# 3. зарегистрироваться, войти и создать ссылку
#    (аккаунта в чистой базе нет — миграции создают только схемы; адрес с Get-Random,
#     чтобы шаг можно было повторить на стенде, где данные уже остались)
$cred = @{ email = "demo$(Get-Random)@example.com"; password = "Passw0rd!" } | ConvertTo-Json
Invoke-RestMethod -Method Post http://localhost:8080/api/auth/register -ContentType 'application/json' `
  -Body $cred | Out-Null
$token = (Invoke-RestMethod -Method Post http://localhost:8080/api/auth/login -ContentType 'application/json' `
  -Body $cred).accessToken
Invoke-RestMethod -Method Post http://localhost:8080/api/links -Headers @{ Authorization = "Bearer $token" } `
  -ContentType 'application/json' -Body (@{ url = "https://example.com/very/long/path" } | ConvertTo-Json)
```

Приложение стартует несколько десятков секунд после `up` (в проверке на чистой базе — 26 с от
запуска контейнера до ответа): в это время gateway отвечает 502, а `POST /api/links` — ошибкой
соединения. Ориентир готовности — `http://localhost:8080/actuator/health` отдаёт
`{"status":"UP"}`.

Имя compose-проекта берётся из каталога файла (`infra`), поэтому второй клон репозитория на той
же машине поднимет стек в том же проекте и пересоздаст контейнеры первого; том `infra_pgdata`
при этом общий. Для параллельного стенда задавай проект явно: `docker compose -p other ...`.

Полный сценарий «регистрация → логин → ссылка → переходы → статистика»: `.\scripts\smoke.ps1`.

Если порт 8080 на машине занят (например Jenkins), наружу поднимается gateway на `APP_PORT` из
`infra/.env` (здесь `28080`); локальный запуск сервиса — так же:
`$env:SERVER_PORT = "28080"; $env:APP_BASE_URL = "http://localhost:28080"`, а автотесты и
нагрузку указывай этим же адресом (`-DbaseUrl=...`, `BASE_URL`).

## Структура

```
infra/                docker-compose (gateway nginx, Postgres, Redis, Kafka, Prometheus, Grafana,
                      приложение) + nginx/nginx.conf + jenkins/ (образ CI, плагины, job)
shortener-service/    Spring Boot сервис
shortener-autotests/  REST Assured автотесты + Allure
shortener-loadtests/  Gatling-симуляции
Jenkinsfile           полный CI-прогон в Jenkins (тесты → образ → стек → автотесты → Allure)
scripts/              smoke.ps1, seed.sql, вспомогательные скрипты
docs/                 отчёты по тестам и нагрузочным экспериментам
```

## Редирект: кэш, асинхронные клики, лимиты

- **Redis (cache-aside, без `@Cacheable`).** Ключи `link:<code>` (адрес) и `link-id:<code>` (id для
  события клика). TTL — `min(app.cache.ttl-seconds, время до expiresAt)`. Ссылки с `maxClicks` не
  кэшируются: их доступность зависит от счётчика в базе. Redis недоступен → редирект идёт в БД,
  ошибка только в логе и в метрике `shortener_cache_requests_total{result="error"}`.
- **Клики через Kafka.** Редирект публикует в топик `click-events` (3 партиции) и не ждёт записи;
  консьюмер `click-writer` пишет в `click_events`. Флаг `APP_CLICKS_CONSUMER_ENABLED=false`
  оставляет сервис работающим, а события — накапливающимися в топике. `max.block.ms=500`: если
  Kafka лежит, редирект всё равно отвечает 302, а `shortener_clicks_publish_errors_total` растёт.
- **`links.click_count` двигает только атомарный `UPDATE` для ссылок с `maxClicks`.** Безлимитные
  ссылки больше не обновляют строку `links` на каждый переход — это снимает конкуренцию за одну
  строку под нагрузкой; статистика считается по `click_events` в `LinkService.stats`, а `click_count`
  остался служебным для проверки лимита.
- **Rate limit создания ссылок** — Bucket4j в памяти процесса, `RATE_LIMIT_CREATE_PER_MINUTE`
  (по умолчанию 10 в минуту на пользователя), ответ 429 с `Retry-After`.
- **Метрики** — `/actuator/prometheus`: `http_server_requests_seconds_bucket` (гистограмма
  percentiles), `shortener_cache_requests_total`, `shortener_clicks_publish_errors_total`,
  `hikaricp_*`, `jvm_*`, лаг консьюмера `kafka_consumer_fetch_manager_records_lag_max`.
  Эндпоинт открыт без токена на самом сервисе — сознательное упрощение учебного проекта; наружу
  его закрывает gateway (см. ниже), а Prometheus ходит к `app:8080` внутри сети.

## Gateway (nginx)

`infra/nginx/nginx.conf` монтируется в контейнер `gateway` (образ `nginx:1.30.6`), он слушает
`80` внутри сети compose и публикуется как `APP_PORT:80`. Порт самого приложения наружу больше
не проброшен — gateway единственная точка входа. Postgres/Redis/Kafka публикуют порты отдельно:
это нужно для `mvnw spring-boot:run` с хоста и для Testcontainers-тестов.

- `X-Forwarded-For/Proto/Port` + `Host: $http_host`, на стороне сервиса
  `server.forward-headers-strategy: native`. Без проброса адресов все клики в статистику
  писались бы с одним внутренним IP прокси; без `X-Forwarded-Port` Tomcat при
  `X-Forwarded-Proto` подставляет порт схемы по умолчанию, и OpenAPI/Swagger теряют `:APP_PORT`
  в адресе «Try it out» (порт nginx берёт из заголовка Host через `map`).
- `/actuator/prometheus` наружу закрыт (`deny all` → 403): Prometheus скоупит `app:8080`
  напрямую внутри сети compose. `/actuator/health` открыт — им пользуются CI и healthcheck.
- `GET /gateway-health` отвечает `ok` без похода в приложение — это healthcheck контейнера.
- `client_max_body_size 16k`: большее тело — 413 ещё до сервиса; `proxy_read_timeout` 10 s.
- Прокинутые статусы не подменяются (`proxy_intercept_errors off`), поэтому `302`, `410 Gone`
  и `429` с `Retry-After` доходят клиенту как есть.

## Тесты

| Что | Команда |
|---|---|
| Юнит + интеграционные (Testcontainers) | `cd shortener-service; .\mvnw.cmd clean verify` |
| Только юнит-тесты | `cd shortener-service; .\mvnw.cmd test` |
| Покрытие (гейт JaCoCo: 100% строк) | `start target\site\jacoco\index.html` после `clean verify` |
| API-автотесты (нужен поднятый стек) | `cd shortener-autotests; .\mvnw.cmd test "-DbaseUrl=http://localhost:8080"` |
| Only smoke / only regression | добавить `"-Dgroups=smoke"` или `"-Dgroups=regression"` |
| Allure-отчёт | `.\mvnw.cmd allure:serve` |
| Нагрузка | `.\scripts\run-load.ps1 -Sim RedirectSimulation -Profile constant -Rps 50 -Duration 120` |

Гейт покрытия жёсткий: в `shortener-service/pom.xml` правило `BUNDLE / LINE COVEREDRATIO >= 1.00`,
то есть `clean verify` падает, если хоть одна измеряемая строка осталась без теста. Из замера
исключены классы без логики — `**/*Application*`, `**/config/**`, `**/dto/**`, `**/entity/**`;
в отчёте 30 классов и 368 строк. Ветки (BRANCH) в гейт не входят и остаются отчётными: 83 из 90,
непокрытые — частично выполненные условия в `LinkCache` (3), `LinkService` (2), `UrlValidator` (1)
и `ApiExceptionHandler` (1).

Юнит и интеграционные тесты видны так же, как автотесты: workflow `service-tests` гоняет
`mvn verify`, пишет сводку (тесты по наборам, проваленные, покрытие) прямо на страницу сборки,
а отчёты складывает в артефакты `service-coverage` (HTML JaCoCo) и `service-test-reports`
(XML surefire/failsafe). Файл `docs/coverage.json` тот же workflow обновляет в `main` —
по нему живёт бейдж покрытия сверху. Тем же скриптом можно посмотреть сводку локально:
`python scripts\test-report-summary.py shortener-service\target docs\coverage.json`.

Интеграционные тесты поднимают Postgres 16, Redis 7 и Kafka 3.9 (apache/kafka) в Testcontainers —
нужен запущенный Docker.
База для тестов всегда чистая: контейнер создаётся под прогон, `jdbc:postgresql://localhost:<свободный порт>/test`.
Мутационная проверка тестов — в `docs/test-validation.md`.

## Документация кода (Javadoc)

Публичные классы сервиса описаны в Javadoc: `cd shortener-service; .\mvnw.cmd javadoc:javadoc`
даёт `target\reports\apidocs\index.html`. Генерация намеренно не привязана к сборке — CI от неё
не зависит, — а версия плагина зафиксирована (`maven-javadoc-plugin` 3.12.0). Doclint включён
во всех группах кроме `missing`: битая ссылка или незакрытый HTML-тег роняют генерацию,
а отсутствие `@param` у тривиальных геттеров и конструкторов DI — нет. Контракты REST
(коды ответов, схемы) при этом живут не в комментариях, а в `@Operation` и Swagger UI.

## CI/CD

Два контура, и оба видны из README.

**GitHub Actions** (`service-tests.yml`, `autotests.yml`) — то, что проверяет сам GitHub:
юнит и интеграционные тесты, прогон автотестов против стека, который workflow поднимает на
раннере, бейджи и файл покрытия. Плагины и версии в нём зафиксированы числами.

**Jenkins** (`Jenkinsfile` + `infra/jenkins/`) — self-hosted, поднимается этим же
compose-файлом:

```powershell
docker compose -f infra\docker-compose.yml --env-file infra\.env --profile ci up -d jenkins
# UI: http://localhost:18088 (порт bound к 127.0.0.1), логин из infra\.env
```

Прогон `shortener-ci`: `mvn verify` (юнит + интеграционные + JaCoCo) → `docker build` под
тегом `shortener-service:ci-<номер>` и образ gateway с запечённым `nginx.conf` (в CI-стеке
конфигурация не монтируется из репозитория: хостовый демон, к которому job обращается через
сокет, не видит workspace сборки) → те же теги встают в CI-стек `shortener-ci` на портах
28180/5442/6389/29092 (не пересекаются с рабочей копией) → ожидание `/actuator/health` →
API-автотесты через gateway → Allure в артефакты → `down -v` в `post: always`. Секреты
стенда генерируются `openssl rand` на время сборки и в репозиторий не попадают.

Отдельно от Actions этот контур нужен потому, что у него есть docker-демон с постоянной
сетью: «собрать образ → поднять им полный стек → дёрнуть его по HTTP» на раннере GitHub не
воспроизводится. Установка job'а, плагинный набор с фиксированными версиями, права на сокет
и вывод реального прогона — `docs/ci-jenkins.md`.

## Ссылки

- Swagger UI: `http://localhost:8080/swagger-ui/index.html` (Authorize — JWT из `/api/auth/login`)
  — адрес через gateway, в `APP_PORT` из `infra/.env`
- Метрики: снаружи gateway закрывает `/actuator/prometheus` (403); Prometheus скоупит
  `http://app:8080/actuator/prometheus` внутри сети compose. Сам Prometheus bound к `127.0.0.1`,
  цель видна на `http://localhost:9090/api/v1/targets`
- Grafana: `http://localhost:3000` (admin / `GRAFANA_PASSWORD` из `infra/.env`). Источник данных
  и дашборд «URL shortener: нагрузка» (10 панелей) подгружаются провижинингом из
  `infra/grafana/provisioning/` и `infra/grafana/dashboards/`. Файл, появившийся в
  `dashboards/` уже после старта контейнера, Grafana за пять минут не подхватил — изменения
  применяются перезапуском (`docker restart infra-grafana-1`)
- Baseline нагрузочных прогонов (железо, лимиты контейнера, p50/p95/p99, воспроизводимость,
  скриншот дашборда и ограничения методики) — `docs/baseline.md`

Решения, компромиссы и результаты нагрузочных тестов описаны далее в README; отчёты по
экспериментам — в `docs/experiments/`.
