# URL Shortener с аналитикой

Сервис сокращения ссылок на Spring Boot: редирект, JWT-аутентификация, статистика кликов,
лимиты и TTL ссылок, кэш Redis, асинхронная запись кликов в Kafka, Prometheus/Grafana,
API-автотесты (REST Assured + Allure) и нагрузочные сценарии (Gatling).

## Быстрый старт (3 команды)

Нужны Docker Desktop, Java 21+ и PowerShell 7.

```powershell
# 1. поднять базу
Copy-Item infra\.env.example infra\.env
docker compose -f infra\docker-compose.yml --env-file infra\.env up -d

# 2. запустить сервис
$env:JWT_SECRET = "dev-secret-dev-secret-dev-secret-123456"
cd shortener-service; .\mvnw.cmd spring-boot:run

# 3. создать ссылку
$token = (Invoke-RestMethod -Method Post http://localhost:8080/api/auth/login -ContentType 'application/json' `
  -Body (@{ email = "demo@example.com"; password = "Passw0rd!" } | ConvertTo-Json)).accessToken
Invoke-RestMethod -Method Post http://localhost:8080/api/links -Headers @{ Authorization = "Bearer $token" } `
  -ContentType 'application/json' -Body (@{ url = "https://example.com/very/long/path" } | ConvertTo-Json)
```

Полный сценарий «регистрация → логин → ссылка → переходы → статистика»: `.\scripts\smoke.ps1`.

Если порт 8080 на машине занят (например Jenkins), запускай сервис на другом:
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

Интеграционные тесты поднимают Postgres 16 в Testcontainers — нужен запущенный Docker.
База для тестов всегда чистая: контейнер создаётся под прогон, `jdbc:postgresql://localhost:<свободный порт>/test`.
Мутационная проверка тестов — в `docs/test-validation.md`.

## Ссылки

- Swagger UI: `http://localhost:8080/swagger-ui/index.html` (Authorize — JWT из `/api/auth/login`)
- Метрики: `http://localhost:8080/actuator/prometheus`
- Grafana: `http://localhost:3000` (admin / `GRAFANA_PASSWORD` из `infra/.env`)

Решения, компромиссы и результаты нагрузочных тестов описаны далее в README; отчёты по
экспериментам — в `docs/experiments/`.
