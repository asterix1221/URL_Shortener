# URL Shortener с аналитикой

[![autotests](https://github.com/asterix1221/URL_Shortener/actions/workflows/autotests.yml/badge.svg)](https://github.com/asterix1221/URL_Shortener/actions/workflows/autotests.yml)
[![service-tests](https://github.com/asterix1221/URL_Shortener/actions/workflows/service-tests.yml/badge.svg)](https://github.com/asterix1221/URL_Shortener/actions/workflows/service-tests.yml)
![coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/asterix1221/URL_Shortener/main/docs/coverage.json)

Сервис сокращения ссылок на Spring Boot: редирект, JWT-аутентификация, статистика кликов,
лимиты и TTL ссылок, кэш Redis, асинхронная запись кликов в Kafka, Prometheus/Grafana,
API-автотесты (REST Assured + Allure) и нагрузочные сценарии (Gatling).

## Быстрый старт (3 команды)

Нужны Docker Desktop, Java 21+ и PowerShell 7.

```powershell
# 1. поднять стек: Postgres + Redis + Kafka + приложение
Copy-Item infra\.env.example infra\.env
docker compose -f infra\docker-compose.yml --env-file infra\.env up -d --build

# 2. (опционально) запуск сервиса локально с hot reload, вместо контейнера
$env:JWT_SECRET = "dev-secret-dev-secret-dev-secret-123456"
cd shortener-service; .\mvnw.cmd spring-boot:run

# 3. создать ссылку
$token = (Invoke-RestMethod -Method Post http://localhost:8080/api/auth/login -ContentType 'application/json' `
  -Body (@{ email = "demo@example.com"; password = "Passw0rd!" } | ConvertTo-Json)).accessToken
Invoke-RestMethod -Method Post http://localhost:8080/api/links -Headers @{ Authorization = "Bearer $token" } `
  -ContentType 'application/json' -Body (@{ url = "https://example.com/very/long/path" } | ConvertTo-Json)
```

Полный сценарий «регистрация → логин → ссылка → переходы → статистика»: `.\scripts\smoke.ps1`.

Если порт 8080 на машине занят (например Jenkins), контейнерное приложение поднимается на
`APP_PORT` из `infra/.env` (здесь `28080`); локальный запуск — так же:
`$env:SERVER_PORT = "28080"; $env:APP_BASE_URL = "http://localhost:28080"`, а автотесты и
нагрузку указывай этим же адресом (`-DbaseUrl=...`, `BASE_URL`).

## Структура

```
infra/                docker-compose (Postgres, Redis, Kafka, Prometheus, Grafana, приложение)
shortener-service/    Spring Boot сервис
shortener-autotests/  REST Assured автотесты + Allure
shortener-loadtests/  Gatling-симуляции
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
  Этот эндпоинт открыт без токена — сознательное упрощение учебного проекта; в проде его
  нужно закрыть или вынести на отдельный порт.

## Тесты

| Что | Команда |
|---|---|
| Юнит + интеграционные (Testcontainers) | `cd shortener-service; .\mvnw.cmd clean verify` |
| Только юнит-тесты | `cd shortener-service; .\mvnw.cmd test` |
| Покрытие (правило ≥ 80% по строкам) | `start target\site\jacoco\index.html` после `clean verify` |
| API-автотесты (нужен поднятый стек) | `cd shortener-autotests; .\mvnw.cmd test "-DbaseUrl=http://localhost:8080"` |
| Only smoke / only regression | добавить `"-Dgroups=smoke"` или `"-Dgroups=regression"` |
| Allure-отчёт | `.\mvnw.cmd allure:serve` |
| Нагрузка | `.\scripts\run-load.ps1 -Sim RedirectSimulation -Profile constant -Rps 50 -Duration 120` |

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

## Ссылки

- Swagger UI: `http://localhost:8080/swagger-ui/index.html` (Authorize — JWT из `/api/auth/login`)
- Метрики: `http://localhost:8080/actuator/prometheus`
- Grafana: `http://localhost:3000` (admin / `GRAFANA_PASSWORD` из `infra/.env`)

Решения, компромиссы и результаты нагрузочных тестов описаны далее в README; отчёты по
экспериментам — в `docs/experiments/`.
