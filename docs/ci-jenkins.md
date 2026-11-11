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
7. `Интерфейс: e2e` — после API-автотестов, против того же уже поднятого стека. Сначала
   `RATE_LIMIT_CREATE_PER_MINUTE=2 docker compose … up -d app`: сценарию `ratelimit.spec.ts`
   нужен лимит 2 на пользователя, а автотесты шага 6 отработали под 1000 из `CI_RATE_LIMIT`.
   Образ при этом не пересобирается — тег остаётся `ci-<номер>`, меняется только окружение
   контейнера. Дальше тот же пробер `/actuator/health` (60 попыток по 2 с), что и на шаге 5:
   `/app/` отдаёт nginx из образа сразу, тогда как перезапущенный Spring ещё не принимает
   `/api`, и первый `page.goto()` поймал бы 502; затем `curl -sf "${BASE_URL}/app/"` — бандл
   на месте. Сборка `docker build -f shortener-web/Dockerfile --target e2e
   -t shortener-web-e2e:ci-<номер> shortener-web` (база `mcr.microsoft.com/playwright:v1.49.1-noble`,
   браузеры уже внутри образа, `npx playwright install` в job не нужен), `docker create --name
   web-e2e --add-host=host.docker.internal:host-gateway -e E2E_BASE_URL=${BASE_URL}` и
   `docker start -a web-e2e`. `E2E_BASE_URL` обязателен: `playwright.config.ts` берёт
   процесс-переменную, а её дефолт — `http://localhost:28380`, локальный стенд задачи 14,
   недоступный из job'а. Отчёт забирается `docker cp web-e2e:/web/playwright-report
   shortener-web/` до `docker rm -f web-e2e`: bind-монтирование workspace в DooD не работает
   (раздел ниже). Код возврата `docker start` сохраняется в `rc` и возвращается после уборки,
   поэтому падение e2e роняет сборку, а не маскируется удалением контейнера. `post: always`
   стадии архивирует `shortener-web/playwright-report/**` (`allowEmptyArchive: true`) и удаляет
   образ по имени с тегом сборки.
8. `post: always` — `allure:report` + архив отчёта, затем `docker compose down -v`: стек
   сносится вместе с томами, следующий прогон начинается с чистой базы и миграций; образы
   `ci-<номер>` удаляются по именам (не `--rmi local`, иначе уехал бы и
   `shortener-jenkins:local` с 71 плагином). Отчёт Playwright архивируется раньше — в `post`
   шага 7, — потому что `down -v` сносит стек, а отчёт к тому моменту уже лежит в workspace.

### Веб-стадии: написаны, не исполнены

Шаги 2 и 7 добавлены в `Jenkinsfile`, но в реальном job не выполнялись. Job берёт `Jenkinsfile`
из репозитория на GitHub (`infra/jenkins/job-config.xml`, параметр `GIT_BRANCH`), поэтому прогон
новых стадий требует push ветки `stage-9-web` в origin — это отдельное явное согласие заказчика,
которого нет. То же и с `.github/workflows/web.yml`: workflow исполняется только по push в `main`
или по PR. Ни одна из новых стадий не объявляется зелёной, и в разделе «Прогон» ниже нет строк
с выдуманным выводом.

Что проверено без push, на этой машине:

* синтаксис `.github/workflows/web.yml` — разбор PyYAML (`yaml.safe_load`), exit 0; в разобранной
  структуре оба job'а, `needs: unit` у `e2e` и три ключа `env`: `RATE_LIMIT_CREATE_PER_MINUTE: '2'`,
  `E2E_BASE_URL: http://localhost:8080`, `APP_IMAGE_TAG: web-ci`;
* сборка обоих таргетов `shortener-web/Dockerfile` — `--target unit` и `--target e2e`, exit 0;
* те же команды юнит-гейта вручную на хосте в `shortener-web`: `npm run lint`, `npm run typecheck`,
  `npm run coverage`;
* `Jenkinsfile` проверен структурно (баланс скобок и кавычек, место вставки стадий, все `${…}`
  внутри одинарных кавычек адресованы shell, а не Groovy) и `bash -n` по извлечённым
  shell-блокам, а не прогоном Jenkins: job берёт `Jenkinsfile` из SCM, то есть требует push,
  а живой Jenkins на 18088 и его стек трогать нельзя.

`timeout(time: 60, unit: 'MINUTES')` в `options` оставлен без изменения. Длительность новых
веб-стадий в реальном job не замерена, поэтому поднимать лимит не на чем: 60 минут относятся к
прежнему набору стадий (сборка №5 — 127 711 мс, семь стадий). Любой локальный замер — нижняя
оценка, а не прогноз: на хосте базовые образы и слои уже прогреты, в job кеш холодный, `npm ci`
внутри таргетов `unit` и `e2e` тянет зависимости заново, а e2e-образ добавляет слой Playwright
с браузерами. Пересматривать лимит после первого реального прогона — по фактическому времени
стадий из `wfapi/describe`, и только тогда записывать сюда новую цифру с причиной.

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
Дописывать сюда вывод непрошедших стадий нечем: они написаны, не исполнены (см. раздел выше).
Первый реальный прогон добавит в таблицу две строки — `Интерфейс: линт, типы, Vitest и гейт
покрытия` и `Интерфейс: e2e` — и фактическое время, по которому будет решаться вопрос о лимите
`timeout`.
