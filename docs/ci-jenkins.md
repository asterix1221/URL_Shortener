# CI/CD на Jenkins

Jenkins поднимается вместе с проектом — это сервис `jenkins` в `infra/docker-compose.yml`
с профилем `ci`, а не отдельный стенд: job собирает те же образы и тем же compose-файлом,
что и разработка.

## Зачем отдельный Jenkins, если есть GitHub Actions

`service-tests.yml`, `autotests.yml` и `web.yml` гоняют тесты на раннерах GitHub — там нет
docker-демона с постоянной сетью, поэтому «собрать образ → поднять им полный стек → прогнать
автотесты по HTTP» там не воспроизводится между сборками. Jenkins на хосте делает именно это,
и заодно остаётся место, где видно историю сборок и артефакты (Allure, JaCoCo, протоколы тестов)
внутри стенда. `web.yml` поднимает стек и на раннере — для e2e интерфейса, — но раннер эфемерный:
история, артефакты и постоянная сеть остаются за Jenkins, а интеграционные тесты на
Testcontainers и Allure в GitHub Actions не перенесены.

## Запуск

```powershell
Copy-Item infra\.env.example infra\.env      # если .env ещё нет
# JENKINS_ADMIN_PASSWORD в infra\.env — локальный, в репозиторий не попадает
docker compose -f infra\docker-compose.yml --env-file infra\.env --profile ci up -d jenkins
```

UI: `http://localhost:18088`. Порт опубликован только на `127.0.0.1`: сокет хостового
демона внутри контейнера даёт фактически root-доступ к docker наружу, поэтому Jenkins
никак не должен слушать на внешнем интерфейсе. На этой машине уже работают чужие
Jenkins (8080/50000) и dind-стенд (18080/18082), поэтому свои порты — 18088 и 50001.

Логин — `JENKINS_ADMIN_USER` / `JENKINS_ADMIN_PASSWORD` из `infra/.env`: их подхватывает
`infra/jenkins/init.groovy` (монтируется в `init.groovy.d/01-security.groovy`) и создаёт
пользователя при первом старте; при последующих стартах тот же скрипт обновляет пароль,
иначе `jenkins-data` пережил бы пересборку со старым. Анонимный доступ закрыт
(`allowAnonymousRead=false`) — без логина `/api/json` отвечает 403.

Setup-wizard отключён на уровне JVM (`JAVA_OPTS=-Djenkins.install.runSetupWizard=false` в
образе), а не только скриптом: если `init.groovy` не отработает, контейнер не должен
оставаться страницей «разблокировать Jenkins» с случайно сгенерированным паролем.

## Образ

`infra/jenkins/Dockerfile` — `jenkins/jenkins:2.580.2-lts-jdk21`, куда копируются:

* `docker` CLI 29.9.2 и плагин `docker compose` из `docker:29.9.2-cli`;
* Maven 3.9.16 из `maven:3.9.16-eclipse-temurin-21` в `/opt/maven`.

Apt-репозиториев нет — всё берётся из образов с фиксированными тегами. Проверено в
контейнере: `mvn -v` → Apache Maven 3.9.16, `docker version` → 29.9.2,
`docker compose version` → v5.6.1, `git` → 2.47.3, `openssl` → 3.5.7, Java → 21.0.13.
**python3 в образе отсутствует**, поэтому сводка покрытия в Jenkinsfile считается `mawk`
по `jacoco.csv`, а не скриптом `scripts/test-report-summary.py`, который использует
GitHub Actions.

### Плагины

В lts-образ плагины не входят: у поднятого контейнера `/usr/share/jenkins/ref` пустой, и
`GET /pluginManager/api/json?depth=1` возвращает `"plugins":[]`. Без них не работает ни
declarative-пайплайн, ни `git`, ни шаг `junit`, ни `timestamps()`. Набор и версии зафиксированы
в `infra/jenkins/plugins.txt` — 71 артефакт (8 прямых: workflow-aggregator,
pipeline-model-definition, pipeline-stage-view, git, credentials-binding, junit, timestamper
+ транзитивные зависимости). Прямые версии взяты не «самые свежие с сайта», а те, что
подобрал `jenkins-plugin-cli` под ядро 2.580.2; транзитивные записаны явно, чтобы пересборка
образа не получила другой набор через неделю.

Обновление списка: прогнать `jenkins-plugin-cli` по прямым плагинам без версий во временный
каталог, взять `Plugin-Version` из `META-INF/MANIFEST.MF` скачанных `.jpi` и перезаписать
`plugins.txt`; проверка совместимости — фактический прогон пайплайна, а не только старт
контейнера.

## Job

Определение — `infra/jenkins/job-config.xml` (Pipeline «script from SCM», `Jenkinsfile` из
корня). Создаётся один раз через REST:

```bash
CRUMB=$(curl -s -u "admin:$JENKINS_ADMIN_PASSWORD" \
  'http://localhost:18088/crumbIssuer/api/json' | sed -E 's/.*"crumb":"([^"]+)".*/\1/')

curl -s -X POST -u "admin:$JENKINS_ADMIN_PASSWORD" \
  -H "Content-Type: application/xml" \
  -H "Jenkins-Crumb: $CRUMB" \
  --data-binary @infra/jenkins/job-config.xml \
  'http://localhost:18088/createItem?name=shortener-ci'
```

Ветка задаётся параметром сборки `GIT_BRANCH` (по умолчанию `main`), а не зашита в
`BranchSpec`: один и тот же job прогоняет и feature-ветку до merge, и `main` после него.
Из-за этого же `lightweight=false` — «лёгкий» режим берёт `Jenkinsfile` HTTP-запросом и не
подставляет параметр в ветку, сборка уехала бы в `main` независимо от параметра.

## Пайплайн

`Jenkinsfile` (declarative) в корень репозитория:

1. `mvn -B verify` в `shortener-service` — surefire (юнит) + failsafe (интеграционные на
   Testcontainers) + JaCoCo; шаг `junit` публикует протоколы, `archiveArtifacts` — HTML
   отчёт покрытия.
2. `Интерфейс: линт, типы, Vitest и гейт покрытия` — `docker build -f shortener-web/Dockerfile
   --target unit -t shortener-web-unit:ci-<номер> shortener-web`, затем `docker run --rm` того
   же образа. В таргет `unit` уже зашиты `RUN npm run lint && npm run typecheck`, а
   `CMD ["npm","run","coverage"]` — это vitest и `scripts/coverage-gate.mjs`, поэтому один
   запуск контейнера прогоняет весь юнит-гейт интерфейса. Node на агенте не появляется
   (`infra/jenkins/Dockerfile` копирует только бинарные docker и Maven), отсюда контейнер.
   Стадия стоит до сборки образов и подъёма стека: юнит-тестам сеть не нужна, а упавший гейт
   не должен тратить время на стек. `post: always` стадии удаляет образ по имени с тегом
   сборки — `:dev` или сборка без `-t` задели бы образ рабочего стенда.
3. `docker build -t shortener-service:ci-<номер>` и `docker compose build gateway` — теги
   попадают в compose (`image: shortener-service:${APP_IMAGE_TAG}` у сервиса `app` и
   `shortener-gateway:${APP_IMAGE_TAG}` у сервиса `gateway` базового файла), поэтому стек
   поднимает ровно те образы, которые были собраны и названы в этой сборке, а не копию
   `shortener-ci-app` или образ с прошлой сборки. Образ gateway собирает `infra/web.Dockerfile`
   из контекста-корня репозитория: внутри и конфигурация nginx, и бандл интерфейса
   (`npx vite build` в `shortener-web`), поэтому CI поднимает тот же вход, что и разработка.
4. `docker compose -f infra/docker-compose.yml up -d` в отдельном проекте `shortener-ci` и на
   своих хост-портах (28180/5442/6389/29092), чтобы не пересекаться с рабочей копией стека.
   Секреты стенда (`POSTGRES_PASSWORD`, `JWT_SECRET`, `IP_SALT`) генерируются `openssl rand`
   на одну сборку и не хранятся в репозитории.
5. Ожидание `GET /actuator/health` через `host.docker.internal` (60 попыток по 2 с); при
   таймауте в лог сборки кладутся `compose ps` и `logs --tail=120 app gateway`.
6. `mvn -B test -DbaseUrl=…` в `shortener-autotests` — автотесты идут через gateway nginx,
   то же самое зеркало, что и у ручной проверки.
7. `Интерфейс: e2e` — после API-автотестов, против того же уже поднятого стека. Стадия разбита на
   два `sh`-шага: первый пересоздаёт app и держит гейт здоровья, второй собирает e2e-образ и
   гоняет тесты. Разбиение обязательно: внутри одного скрипта `exit 0` из цикла ожидания завершил
   бы весь шаг и пропустил сборку с прогоном. Первая строка стадии —
   `rm -rf shortener-web/playwright-report`: workspace между сборками не чистится, а каталог
   gitignored (`.gitignore:28`), поэтому без очистки `archiveArtifacts` положил бы в артефакты
   текущего job'а отчёт предыдущего. Дальше
   `RATE_LIMIT_CREATE_PER_MINUTE=2 docker compose … up -d app`: сценарию `ratelimit.spec.ts`
   нужен лимит 2 на пользователя, а автотесты шага 6 отработали под 1000 из `CI_RATE_LIMIT`.
   Образ при этом не пересобирается — тег остаётся `ci-<номер>`, меняется только окружение
   контейнера. Затем тот же пробник `/actuator/health` (60 попыток по 2 с), что и на шаге 5:
   `/app/` отдаёт nginx из образа сразу, тогда как перезапущенный Spring ещё не принимает
   `/api`, и первый `page.goto()` поймал бы 502. Гейт падает громко: при успехе `exit 0`, а по
   таймауту — сообщение про 120 с, `compose ps` и `logs --tail=120 app gateway` в лог сборки,
   затем `exit 1`, ровно как на шаге 5. Тихо выходить из цикла нельзя: следующая проверка
   `curl -sf "${BASE_URL}/app/"` получила бы 200 от nginx и при мёртвом приложении, и стадия
   гоняла бы Playwright против него, краснея от падений тестов, а не от таймаута. Второй шаг:
   `curl -sf "${BASE_URL}/app/"` — бандл на месте; сборка `docker build -f shortener-web/Dockerfile
   --target e2e -t shortener-web-e2e:ci-<номер> shortener-web` (база
   `mcr.microsoft.com/playwright:v1.49.1-noble`, браузеры уже внутри образа, `npx playwright
   install` в job не нужен); `docker rm -f web-e2e || true` перед `docker create --name web-e2e
   --add-host=host.docker.internal:host-gateway -e E2E_BASE_URL=${BASE_URL}` — имя контейнера
   глобальное на хосте, а не в пространстве имён compose-проекта, и без очистки прерванный
   предыдущий job ронял бы `docker create` на коллизии имени в каждом следующем прогоне.
   `E2E_BASE_URL` обязателен: `playwright.config.ts` берёт процесс-переменную, а её дефолт —
   `http://localhost:28380`, локальный стенд задачи 14, недоступный из job'а. Код возврата
   снимается как `rc=0`, затем `docker start -a web-e2e || rc=$?` и `exit $rc`: команда стоит в
   AND-OR списке не последней, поэтому `-e` её не роняет, а код остаётся настоящим, не константой.
   Уборка — `docker cp web-e2e:/web/playwright-report shortener-web/`, затем `docker rm -f web-e2e`
   — живёт в `post: always` стадии ДО `archiveArtifacts shortener-web/playwright-report/**`
   (`allowEmptyArchive: true`), а `docker image rm -f shortener-web-e2e:ci-<номер>` — после
   удаления контейнера, иначе образ только теряет тег: его удерживает осиротевший контейнер.
   Отчёт лежит внутри ФС контейнера, потому что bind-монтирование workspace в DooD не работает
   (раздел ниже). Причина переноса уборки в `post` одна: `sh` в Jenkins идёт с `-e`, поэтому
   внутри основного скрипта уборка не выполнилась бы при падении e2e, а отчёт нужен именно при
   падении.
8. `post: always` — `allure:report` + архив отчёта, затем `docker compose down -v`: стек
   сносится вместе с томами, следующий прогон начинается с чистой базы и миграций; образы
   `ci-<номер>` удаляются по именам (не `--rmi local`, иначе уехал бы и
   `shortener-jenkins:local` с 71 плагином). Отчёт Playwright архивируется раньше — в `post`
   шага 7, — потому что `down -v` сносит стек, а отчёт к тому моменту уже лежит в workspace.

### Веб-стадии Jenkins: первый успешный прогон №6

2026-11-12 по отдельному согласию заказчика запущен существующий `infra-jenkins-1`, затем
`shortener-ci` с параметром `GIT_BRANCH=stage-9-web`. Job взял `Jenkinsfile` и исходники из
SCM: фактический SHA в API сборки — `6aefea15a9c03da226c7a5f33190d6831c443b5a`.
[Сборка №6](http://localhost:18088/job/shortener-ci/6/) завершилась **SUCCESS за 460 878 мс**
(7 мин 40.878 с). Ни job, ни `Jenkinsfile` для запуска не менялись.

Все стадии имеют статус `SUCCESS`; длительности взяты из `wfapi/describe` этой сборки:

| Стадия | Длительность, мс |
|---|---:|
| Declarative: Checkout SCM | 1 518 |
| Сервис: сборка и тесты | 63 085 |
| Интерфейс: линт, типы, Vitest и гейт покрытия | 100 140 |
| Образ приложения | 134 335 |
| Стек: поднимается | 7 585 |
| Стек: готов | 15 206 |
| API-автотесты | 19 607 |
| Интерфейс: e2e | 100 492 |
| Declarative: Post Actions | 12 106 |

Общая длительность взята отдельно из `duration` API сборки, а не из суммы строк таблицы.
Подтверждение по консоли и архивированным отчётам:

* `mvn verify`: 104 юнит + 19 интеграционных, ошибок и пропусков нет; JUnit API — 123 успешных
  теста. В архивированном `jacoco.xml` верхний счётчик `LINE`: `covered=387`, `missed=0`,
  то есть 100 % строк; в консоли — `All coverage checks have been met.`;
* `npm run lint`, `npm run typecheck`, `npm run coverage` выполнены; Vitest — 33 файла,
  179 тестов, 100 % строк и 99.79 % ветвей по всему отчёту; `Гейт покрытия пройден.`;
* API-автотесты — 38 успешных, в `widgets/summary.json` отчёта Allure `failed`, `broken`
  и `skipped` равны нулю;
* Playwright — `Running 6 tests using 1 worker`, `6 passed (9.9s)`, `exit 0`.
  Встроенный `report.json` из архивированного `shortener-web/playwright-report/index.html`
  подтверждает `total=6`, `expected=6`, `unexpected=0`, `flaky=0`, `skipped=0`.
  Отчёты JaCoCo, Allure и Playwright доступны в артефактах сборки.

Уборка проверена не только по `SUCCESS`: после `post: always` Docker сверен со снимком
до запуска. Нет ресурсов compose-проекта `shortener-ci`, контейнера `web-e2e` и четырёх тегов
`shortener-service:ci-6`, `shortener-gateway:ci-6`, `shortener-web-unit:ci-6`,
`shortener-web-e2e:ci-6`. В консоли подтверждено удаление `shortener-ci_pgdata` и
`shortener-ci_default`. Все 14 исходных контейнеров сохранили идентификаторы, 21 исходный том,
7 сетей и прежние теги/идентификаторы образов на месте; новых тегов нет. Основная база
`infra_pgdata` и домашний том `infra_jenkins-data` сохранены. Семь основных сервисов `infra`
остались остановленными с прежним `FinishedAt`; существующий Jenkins оставлен работающим
для просмотра отчётов. Старые образы s9 и общий кеш Docker не удалялись.

До этого прогона веб-стадии были только написаны: push ветки и PR #4 сами по себе Jenkins
не запускают. GitHub Actions проверен раньше: первый `e2e` завис в `Install browsers`
и был отменён; после правки на `45c7d45` оба job'а успешны, `6 passed (7.9s)`
(разбор ниже). История локальных проверок до первого реального запуска Jenkins:

* синтаксис `.github/workflows/web.yml` — разбор PyYAML (`yaml.safe_load`), exit 0; в разобранной
  структуре оба job'а, `needs: unit` у `e2e` и три ключа `env`: `RATE_LIMIT_CREATE_PER_MINUTE: '2'`,
  `E2E_BASE_URL: http://localhost:8080`, `APP_IMAGE_TAG: web-ci`;
* сборка обоих таргетов `shortener-web/Dockerfile` — `--target unit` и `--target e2e`, exit 0;
* те же команды юнит-гейта вручную на хосте в `shortener-web`: `npm run lint`, `npm run typecheck`,
  `npm run coverage`;
* `Jenkinsfile` проверен структурно (баланс скобок и кавычек, место вставки стадий, все `${…}`
  внутри одинарных кавычек адресованы shell, а не Groovy) и `bash -n` по извлечённым
  shell-блокам, а не прогоном Jenkins: job берёт `Jenkinsfile` из SCM, то есть требует push,
  а живой Jenkins на 18088 и его стек трогать нельзя;
* фикс-раунд 1 по e2e-стадии: семантика `-e` проверена двумя экспериментами (`sh -e -c 'false;
  rc=$?; …'` обрывается до следующей команды и даёт exit 1, `sh -e -c 'rc=0; false || rc=$?; …'`
  доходит до конца и сохраняет код), `bash -n` по обоим shell-блокам новой стадии,
  `docker rm -f web-e2e || true` при отсутствии контейнера — exit 0. Стадии в CI по-прежнему
  не исполнялись, вывод непрошедших стадий не дописан.
* фикс-раунд финального ревью: в `web.yml` после выгрузки артефакта добавлены два шага —
  «Логи стека при падении» (`if: failure()`, `logs --tail=200 app gateway`) и «Снос стека»
  (`if: always()`, `down -v`); порядок сознательный — сначала артефакт и логи, потом снос.
  Проверка та же: разбор PyYAML `yaml.safe_load` → `yaml ok`, exit 0, плюс вычитка отступов
  и ключей `if:`/`run:` относительно соседних шагов. В `Jenkinsfile` предочистка
  `docker rm -f web-e2e || true` перенесена из второго `sh`-шага в первый, рядом с
  `rm -rf shortener-web/playwright-report`: имя контейнера глобальное на хосте, а `docker cp`
  в `post { always }` выполняется на любом пути, поэтому при падении первого шага в артефакты
  попадал бы отчёт «протёкшего» контейнера. Проверка — `git grep -n 'web-e2e' Jenkinsfile`:
  строка предочистки ровно одна и стоит в первом шаге. Правки в `web.yml` исполнены в CI
  на коммите `45c7d45`: «Логи стека при падении» — `skipped` (job зелёный), «Снос стека» —
  `success`, в логе job'а `down -v` удалил контейнеры, том `infra_pgdata` и сеть `infra_default`.
  На момент фикс-раунда правка в `Jenkinsfile` ещё не была исполнена; теперь она проверена
  сборкой №6, описанной выше.

`timeout(time: 60, unit: 'MINUTES')` в `options` оставлен без изменения: первый реальный
прогон с веб-стадиями занял 460 878 мс, юнит-стадия интерфейса — 100 140 мс, e2e-стадия —
100 492 мс вместе со сборкой образа, запуском тестов и её `post`. Эти значения не требуют
повышения лимита. Сборка №5 (127 711 мс, семь стадий) остаётся историческим замером без
фронтенда и с №6 напрямую не сопоставима. Кеш Docker общий для хоста и Jenkins через DooD:
один успешный прогон не предсказывает длительность на холодном хосте или при другой сети.
При изменении условий лимит следует пересматривать по новым фактическим замерам.

### Первый прогон web.yml в CI: распаковщик Playwright встаёт на Node 26

Прогон `web` на PR #4 довёл `e2e` до шага `Install browsers` и остановился (`unit` — success).
По логу job'а: шаг `Start stack` с 18:29:38.510 до 18:30:54.452 — **76 с**, образы
`shortener-service:web-ci` и `shortener-gateway:web-ci` собраны, контейнеры подняты, ожидание
`/actuator/health` и проверка `/app/` прошли. `Install browsers` стартовал в 18:31:13.495,
apt-зависимости встали чисто (`Service restarts being deferred`, интерактивного запроса не было),
загрузка `Chromium 131.0.6778.33 (playwright build v1148)` с
`https://playwright.azureedge.net/builds/chromium/1148/chromium-linux.zip` дошла от 0% до
`100% of 161.3 MiB` за **0.84 с** (18:31:21.716 → 18:31:22.555) — и дальше ни строки до
`The operation was canceled.` в 19:13:04.020, то есть **41 мин 41 с** тишины. Job отменён вручную:
GitHub отдаёт логи только завершённого job'а, до отмены запрос возвращал `404 BlobNotFound`.
В `web.yml` не было `timeout-minutes`, поэтому дефолтные 360 минут job'а молчали бы до конца.

Причина не в сети и не в CDN. Zip, скачанный при локальном повторе (143564014 Б, 85 записей),
проверен независимо от Playwright: `zipfile` в Python читает `chrome-win/chrome.dll` целиком,
238968832 Б, CRC `0x2f739fa9` совпадает с объявленным в центральной директории. Байты целые —
ломается распаковщик:

* локальный `PLAYWRIGHT_BROWSERS_PATH=<temp> npx playwright install chromium` на той же версии
  1.49.1: загрузка 100% of 136.9 MiB, выхода нет, `timeout 420` убивает процесс (`exit 124`).
  В каталоге браузеров два файла — манифест 226 Б и `chrome.dll` **238948275 Б** вместо 238968832,
  маркера `INSTALLATION_COMPLETE` нет; размер не растёт за 20 с наблюдения, CPU дочернего процесса
  3.94 с за всё время, свободного места на диске 281.63 ГБ;
* изолированный вызов `extract()` из `playwright-core/lib/zipBundle.js` на том же zip:
  Node **v26.12.0** — обрыв на тех же 238948275 Б уже к 3-й секунде и `PROBE_TIMEOUT_60S`
  без ошибок и без `unhandledRejection`; Node **v22.23.5** — `EXTRACT_RESOLVED after 2.8 s`,
  81 файл;
* полный `install chromium` под Node v22.23.5 — exit 0, `INSTALLATION_COMPLETE` на месте.

Механизм по исходникам 1.49.1: `_downloadExecutable` передаёт загрузку дочернему процессу
(`oopDownloadBrowserMain.js`), родитель резолвит ожидание только по его `exit`/`error`, а дочерний
после загрузки ждёт `extract()`. Три повтора в `browserFetcher` срабатывают на ошибку, но не
на зависание; `PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT` (30000 по умолчанию) — таймаут соединения,
не чтения. Отсюда тишина вместо падения. Node 26 — общий фактор двух площадок: в CI
`node-version: '26'`, в shell на этой машине `node --version` = v26.12.0. Установка 9 ноября
на прежнем Node прошла полностью: 82 файла, 314 МБ, `chrome.dll` 238968832 Б, маркер на месте.

Правка в `web.yml` — две строки конфигурации плюс комментарии: `node-version: '22'` в `e2e`
и `timeout-minutes: 30` на job. `unit` остаётся на 26 (литералы `Intl`, правило задачи 7
к задаче 16), `runs-on` не меняется: зависание воспроизведено и на Windows, то есть ОС ни при чём.
Версия Node в `e2e` на ассерты не влияет — текст интерфейса считает Chromium,
в `shortener-web/e2e` нет ни `Intl`, ни `toLocale*`; `engines` проекта `node >=20`,
vite 5 и vitest 2 допускают 22. Проверка правки на этой машине: разбор PyYAML `yaml.safe_load`
— exit 0, в разобранной структуре `unit` с `node-version '26'`, `e2e` с `'22'`
и `timeout-minutes 30`.

Прогон после правки подтвердил её в CI: коммит `45c7d45`, run `43089719172`, job `e2e`
id `130763626642`. `setup-node` поднял **v22.23.4**, `Install browsers` — success за 20 с
(19:45:25 → 19:45:45 UTC), загрузка `chromium-linux.zip` с 19:45:38.7 до 19:45:42.7 и распаковка
без обрыва, затем `Running 6 tests using 1 worker` и **`6 passed (7.9s)`**, код выхода 0.
Прошли все шесть сценариев: `auth.spec.ts` — регистрация, создание, копирование, повторный вход
и переключатель языка без перезагрузки; `links.spec.ts` — пусто → создание → конфликт → удаление;
`ratelimit.spec.ts` — третья ссылка за минуту, баннер и отсчёт; `session.spec.ts` — подменённый
токен; `stats.spec.ts` — клики доходят до статистики через Kafka. `unit` на Node 26 в том же
прогоне — success, включая `npm run coverage` с гейтом. Соседние прогоны того же коммита тоже
зелёные: `service-tests` run `43089719185`, `autotests` run `43089719195`.

Jenkins этой проблемы не касается: его e2e-стадия идёт в образе
`mcr.microsoft.com/playwright:v1.49.1-noble` (`shortener-web/Dockerfile:20`), браузеры приезжают
вместе с образом, шага `playwright install` там нет вовсе.

### Bind-монтирования репозитория в DooD не работают

Сборка №2 упала на этапе «Стек: поднимается» — стек стартовал, но контейнер `gateway` не
создался (постфикс времени в логе Jenkins убран):

```
Error response from daemon: failed to create task for container: failed to create shim task:
OCI runtime create failed: runc create failed: unable to start container process:
error during container init: error mounting
"/var/jenkins_home/workspace/shortener-ci/infra/nginx/nginx.conf" to rootfs at
"/etc/nginx/conf.d/default.conf": mount src=..., dst=/etc/nginx/conf.d/default.conf,
flags=MS_BIND|MS_REC: not a directory: Are you trying to mount a directory onto a file
(or vice-versa)? Check if the specified host path exists and is the expected type
```

Путь из `volumes:` резолвит демон, а не клиент. Демон этот — хостовый (сокет примонтирован в
контейнер Jenkins), и `/var/jenkins_home/...` для него не путь из файловой системы демона: это
точка монтирования внутри контейнера. Демон не нашёл источник и создал на его месте каталог,
отсюда «mount a directory onto a file». Клиент `docker compose` внутри job'а файл видел —
поэтому ошибка и выглядела как «файл есть, но смонтировать не выходит».

Решение, которым дефект закрыт сейчас, — образ вместо монтирования в базовом
`infra/docker-compose.yml`: `gateway` собирается из `infra/web.Dockerfile` (контекст — корень
репозитория) и получает тег `shortener-gateway:${APP_IMAGE_TAG:-dev}`, а `volumes:` у сервиса
больше нет. Конфигурация nginx и бандл интерфейса запечены внутрь образа, поэтому один и тот же
артефакт поднимают и разработка, и CI, и `!reset` не нужен: затирать нечего. Контекст сборки так
не ломается: его клиент `docker compose` читает сам и передаёт демону потоком — в отличие от
bind-пути, который резолвит демон.

Промежуточным решением был оверлей `infra/docker-compose.ci.yml` с `volumes: !reset []`
(без `!reset` compose дописал бы монтирование к списку базового файла, и ошибка осталась бы) и
отдельным `infra/nginx/Dockerfile`, запекавшим одну конфигурацию. Оба файла удалены: они держали
две копии gateway — монтируемую в разработке и собранную в CI, — то есть ровно то расхождение,
из-за которого дефект вообще дожил до сборки №2. Текст выше сохранён как описание причины,
а не как инструкция.

Разработческий цикл правок бандла без пересборки образа даёт `infra/docker-compose.dev.yml`:
он монтирует `../shortener-web/dist` поверх `/usr/share/nginx/html/app`. Это монтирование
запускается только с хоста, где путь однозначно разрешим; в DooD его не используют — там
пересборка образа, внутри которого `npx vite build` собирает бандл (хостового `npm` в job нет).
Монтирование `nginx.conf` не возвращается нигде: правка конфигурации теперь требует
`docker compose build gateway`.

### Почему всё через `host.docker.internal`

Job живёт внутри контейнера, к которому примонтирован сокет хостового демона: поднятые им
контейнеры — соседи по хосту, а не по сети job'а. Без `extra_hosts:
host.docker.internal:host-gateway` job не дотянулся бы ни до CI-стека, ни до портов
Testcontainers; `TESTCONTAINERS_HOST_OVERRIDE` нужен тем же интеграционным тестам на шаге 1.

### Права на сокет

Сокет монтируется как `root:root 660`, а Jenkins внутри работает под `uid=1000(jenkins)` —
первый же `docker version` из job'а давал `permission denied`. Решение — `group_add: ["root"]`
в сервисе `jenkins`: процесс получает группу владельца сокета, оставаясь непривилегированным
пользователем (в `root` контейнер переводил бы владение `JENKINS_HOME` и рабочими
каталогами job'ов).

## Прогон

Сборка №3 job'а `shortener-ci` — ветка `ci/gateway-image-for-dood` (коммит `18f0593`),
результат `SUCCESS`, длительность 120 905 мс. Стадии по `wfapi/describe`:

| Стадия | Статус | Время |
|---|---|---|
| Declarative: Checkout SCM | SUCCESS | 959 ms |
| Сервис: сборка и тесты | SUCCESS | 48 457 ms |
| Образ приложения | SUCCESS | 14 776 ms |
| Стек: поднимается | SUCCESS | 6 796 ms |
| Стек: готов | SUCCESS | 13 713 ms |
| API-автотесты | SUCCESS | 26 206 ms |
| Declarative: Post Actions | SUCCESS | 7 547 ms |

Что видно в консоли (`/job/shortener-ci/3/consoleText`):

* тесты сервиса — `Tests run: 99, Failures: 0, Errors: 0, Skipped: 0` (surefire) и
  `Tests run: 19, Failures: 0, Errors: 0, Skipped: 0` (failsafe на Testcontainers);
* гейт покрытия — `All coverage checks have been met.` и описание сборки
  `Покрытие строк (JaCoCo): 100.0%`;
* образы — `size=648742613 bytes` для `shortener-service:ci-3`, `Image
  shortener-gateway:ci-3 Built` → `size=239512484 bytes`;
* стек — `Container shortener-ci-gateway-1 Started` без ошибки монтирования, и
  `docker compose ... images app gateway` печатает обе строки с тегом `ci-3`
  (649MB / 240MB), то есть в стеке ровно артефакты этой сборки;
* готовность — `{"status":"UP"}` из `curl -sf http://host.docker.internal:28180/actuator/health`
  на 7-й попытке (6 пауз по 2 с, стадия 13,7 с);
* автотесты — `mvn -B test -DbaseUrl=http://host.docker.internal:28180` →
  `Tests run: 38, Failures: 0, Errors: 0, Skipped: 0` и `BUILD SUCCESS`: все проверки идут через
  gateway nginx, как и ручная проверка;
* `post` — `down -v`, затем `Untagged: shortener-service:ci-3` и
  `Untagged: shortener-gateway:ci-3`, и «CI-стек удалён; артефакты сборки — Allure, JaCoCo,
  протоколы тестов».

Артефакты сборки №3 (`api/json?depth=1`): 586 файлов, среди них `allure-maven.html` (отчёт
автотестов) и `jacoco.xml` / `jacoco.csv` / `jacoco-sessions.html` (отчёт покрытия); протоколы
тестов отдельным артефактом не лежат — их показывает вкладка Test Result (шаг `junit`).

История падений до зелёного прогона: сборка №1 споткнулась на «Образ приложения»
(`the --mount option requires BuildKit`) — помог `docker-buildx` в образ Jenkins; сборка №2 —
на «Стек: поднимается» из-за bind-монтирования (см. раздел выше). Обе починки видны в
`git log` по коммитам `3756983` и `18f0593`.

После ветки `docs/javadoc-api` (Javadoc по всему main-коду и `maven-javadoc-plugin` 3.12.0 в
`shortener-service/pom.xml`) `main` был перепроверен сборкой №4 на коммите `29cfc1c`:
`SUCCESS` за 117 511 мс, все семь стадий зелёные, в консоли те же `Tests run: 99` /
`Tests run: 19` / `All coverage checks have been met.`, `Tests run: 38` в автотестах,
737 архивированных артефактов. Плагин в сборке не участвует — execution не привязан к фазе,
и `mvn verify` его не вызывает; генерация документации отдельной командой описана в README
(раздел «Документация кода (Javadoc)»), выход — `shortener-service/target/reports/apidocs`.

После этапа 6 (Prometheus/Grafana в compose, модуль `shortener-loadtests`, `scripts/run-load.ps1`)
`main` перепроверен сборкой №5 на коммите мержа `7461d76`: `SUCCESS` за 127 711 мс,
`Tests run: 99` / `Tests run: 19` / `All coverage checks have been met.` / `Tests run: 38`
в автотестах, `Finished: SUCCESS`. Мониторинг в сборке не участвовал: `docker compose up`
поднял ровно пять контейнеров — `shortener-ci-{app,gateway,kafka,postgres,redis}-1`, — потому
что `prometheus` и `grafana` закрыты `profiles: ["monitoring"]`, а пайплайн и
`.github/workflows/autotests.yml` вызывают `up` без профилей. Тот же коммит зелёный и в
GitHub Actions: run `41324333179` (workflow `autotests`, заголовок страницы ссылается на
`7461d76`), бейдж workflow — `passing`.

Сборки №3-№5 шли до появления веб-стадий, поэтому в их таблицах и консолях шагов 2 и 7 нет.
Дописывать сюда вывод непрошедших стадий нечем: веб-стадии Jenkins написаны, не исполнены
(см. раздел выше); зелёный прогон `web.yml` в GitHub Actions — другой контур, его вывод в таблицы
Jenkins не переносится.
Первый реальный прогон Jenkins добавит в таблицу две строки — `Интерфейс: линт, типы, Vitest и гейт
покрытия` и `Интерфейс: e2e` — и фактическое время, по которому будет решаться вопрос о лимите
`timeout`.
