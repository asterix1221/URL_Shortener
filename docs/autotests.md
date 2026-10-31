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
