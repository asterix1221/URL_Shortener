# CI/CD на Jenkins

Jenkins поднимается вместе с проектом — это сервис `jenkins` в `infra/docker-compose.yml`
с профилем `ci`, а не отдельный стенд: job собирает те же образы и тем же compose-файлом,
что и разработка.

## Зачем отдельный Jenkins, если есть GitHub Actions

`service-tests.yml` и `autotests.yml` гоняют тесты на раннерах GitHub — там нет docker-демона
с постоянной сетью, поэтому «собрать образ → поднять им полный стек → прогнать автотесты по
HTTP» там не воспроизводится. Jenkins на хосте делает именно это, и заодно остаётся место,
где видно историю сборок и артефакты (Allure, JaCoCo, протоколы тестов) внутри стенда.

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
2. `docker build -t shortener-service:ci-<номер>` и `docker compose build gateway` — теги
   попадают в compose (`image: shortener-service:${APP_IMAGE_TAG}` у сервиса `app` и
   `shortener-gateway:${APP_IMAGE_TAG}` в оверлее), поэтому стек поднимает ровно те образы,
   которые были собраны и названы в этой сборке, а не копию `shortener-ci-app` или образ
   с прошлой сборки.
3. `docker compose -f infra/docker-compose.yml -f infra/docker-compose.ci.yml up -d` в
   отдельном проекте `shortener-ci` и на своих хост-портах (28180/5442/6389/29092), чтобы не
   пересекаться с рабочей копией стека. Секреты стенда (`POSTGRES_PASSWORD`, `JWT_SECRET`,
   `IP_SALT`) генерируются `openssl rand` на одну сборку и не хранятся в репозитории.
4. Ожидание `GET /actuator/health` через `host.docker.internal` (60 попыток по 2 с); при
   таймауте в лог сборки кладутся `compose ps` и `logs --tail=120 app gateway`.
5. `mvn -B test -DbaseUrl=…` в `shortener-autotests` — автотесты идут через gateway nginx,
   то же самое зеркало, что и у ручной проверки.
6. `post: always` — `allure:report` + архив отчёта, затем `docker compose down -v`: стек
   сносится вместе с томами, следующий прогон начинается с чистой базы и миграций; образы
   `ci-<номер>` удаляются по именам (не `--rmi local`, иначе уехал бы и
   `shortener-jenkins:local` с 71 плагином).

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

Решение — оверлей `infra/docker-compose.ci.yml`: `volumes: !reset []` затирает список
монтирований целиком (без `!reset` compose дописал бы его к базовому файлу, и ошибка осталась
бы), а `image:` и `build:` переводят `gateway` на `shortener-gateway:${APP_IMAGE_TAG}`,
который собирается из `infra/nginx/Dockerfile` — конфигурация запечена внутрь образа. Контекст
сборки так не ломается: его клиент `docker compose` читает сам и передаёт демону потоком.

Разработческий стек (базовый файл) монтирование сохраняет: править `nginx.conf` там можно без
пересборки образа, а `docker compose up` запускается из репозитория на хосте, где путь
однозначно разрешим.

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
