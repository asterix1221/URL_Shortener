// Jenkins-пайплайн URL Shortener: сборка сервиса → тесты (unit + интеграционные на
// Testcontainers) → юнит-гейт интерфейса в контейнере → образ → полноценный стек в Docker
// Compose → API-автотесты → e2e интерфейса против того же стека → Allure.
//
// ТРЕБОВАНИЕ К АГЕНТУ: job выполняется внутри контейнера Jenkins, где смонтирован сокет
// хостового Docker-демона (сервис jenkins в infra/docker-compose.yml). Поэтому:
//   * тесты и приложение видны наружу только через host.docker.internal, а не через localhost;
//   * CI-стек поднимается в отдельном compose-проекте и на своих хост-портах, иначе он
//     конфликтует с разработческой копией стека на той же машине.
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '15'))
        timeout(time: 60, unit: 'MINUTES')
    }

    environment {
        COMPOSE_PROJECT_NAME = 'shortener-ci'

        // Порты CI-стека не пересекаются ни с локальной разработкой
        // (28080/5432/6379/9092), ни с внешним Jenkins этой машины (8080/50000).
        APP_PORT      = '28180'
        POSTGRES_PORT = '5442'
        REDIS_PORT    = '6389'
        KAFKA_PORT    = '29092'

        // Автотесты создают больше 10 ссылок в минуту — лимит поднят, как в .env.example.
        CI_RATE_LIMIT = '1000'

        // Порт хоста видит Docker Desktop, а не сам контейнер: отсюда и host.docker.internal.
        BASE_URL = 'http://host.docker.internal:28180'
        TESTCONTAINERS_HOST_OVERRIDE = 'host.docker.internal'

        COMPOSE_FILE = 'infra/docker-compose.yml'
        ENV_FILE = 'infra/.env'

        // Теги образов, которые пайплайн собирает и которые затем встают в стек: сервисы app и
        // gateway в compose ссылаются на shortener-service:${APP_IMAGE_TAG} и
        // shortener-gateway:${APP_IMAGE_TAG}.
        APP_IMAGE_TAG = "ci-${env.BUILD_NUMBER}"
    }

    stages {
        stage('Сервис: сборка и тесты') {
            steps {
                // verify = surefire (юнит) + failsafe (интеграционные на Testcontainers) + JaCoCo.
                dir('shortener-service') {
                    sh 'mvn -B verify'
                }
                // Python в образе Jenkins нет (и apt-репозитории мы не трогаем), поэтому сводку
                // считает mawk по тем же числам, что берёт скрипт GitHub Actions: сумма
                // LINE_MISSED/LINE_COVERED в jacoco.csv равна итоговому LINE-счётчику в jacoco.xml.
                script {
                    def coverage = sh(returnStdout: true, script: '''
                        awk -F, 'NR>1 {missed+=$8; covered+=$9}
                             END { if (missed+covered > 0) printf "%.1f%%", 100*covered/(missed+covered) }' \
                            shortener-service/target/site/jacoco/jacoco.csv 2>/dev/null || true
                    ''').trim()
                    if (!coverage) {
                        coverage = 'нет данных'
                    }
                    currentBuild.description = "Покрытие строк (JaCoCo): ${coverage}. Протоколы тестов — " +
                            'вкладка Test Result, HTML-отчёт — в артефактах.'
                    echo currentBuild.description
                }
            }
            post {
                always {
                    junit allowEmptyResults: true,
                          testResults: 'shortener-service/target/surefire-reports/*.xml,shortener-service/target/failsafe-reports/*.xml'
                    archiveArtifacts artifacts: 'shortener-service/target/site/jacoco/**',
                                     allowEmptyArchive: true
                }
            }
        }

        stage('Интерфейс: линт, типы, Vitest и гейт покрытия') {
            steps {
                // Node на агенте не появляется (см. infra/jenkins/Dockerfile: только бинарные
                // COPY из официальных образов), поэтому прогон в контейнере.
                sh 'docker build -f shortener-web/Dockerfile --target unit ' +
                   '-t shortener-web-unit:${APP_IMAGE_TAG} shortener-web'
                sh 'docker run --rm shortener-web-unit:${APP_IMAGE_TAG}'
            }
            post {
                always { sh 'docker image rm -f shortener-web-unit:${APP_IMAGE_TAG} || true' }
            }
        }

        stage('Образ приложения') {
            steps {
                sh 'docker build -t shortener-service:${APP_IMAGE_TAG} shortener-service'
                sh 'docker image inspect shortener-service:${APP_IMAGE_TAG} --format "size={{.Size}} bytes"'

                // Gateway — конфиг и бандл интерфейса внутри образа: его сборочный контекст
                // (корень репозитория) клиент compose читает сам и отдаёт демону потоком,
                // поэтому путь из workspace доезжает до сборки.
                // Здесь ещё нет --env-file: infra/.env генерируется следующим этапом, а тег
                // берётся из окружения job'а (${APP_IMAGE_TAG} подставляется при интерполяции).
                sh 'docker compose -f "${COMPOSE_FILE}" build gateway'
                sh 'docker image inspect shortener-gateway:${APP_IMAGE_TAG} --format "size={{.Size}} bytes"'
            }
        }

        stage('Стек: поднимается') {
            steps {
                sh '''
                    # .env стенда генерируется на лету: пароли не хранятся в репозитории
                    # и живут ровно одну сборку — в post-блоке стек сносится вместе с томами.
                    {
                        echo "POSTGRES_DB=shortener"
                        echo "POSTGRES_USER=shortener"
                        echo "POSTGRES_PASSWORD=$(openssl rand -hex 12)"
                        echo "JWT_SECRET=$(openssl rand -hex 32)"
                        echo "IP_SALT=$(openssl rand -hex 16)"
                        echo "APP_PORT=${APP_PORT}"
                        echo "POSTGRES_PORT=${POSTGRES_PORT}"
                        echo "REDIS_PORT=${REDIS_PORT}"
                        echo "KAFKA_PORT=${KAFKA_PORT}"
                        echo "RATE_LIMIT_CREATE_PER_MINUTE=${CI_RATE_LIMIT}"
                        echo "APP_CLICKS_CONSUMER_ENABLED=true"
                    } > "${ENV_FILE}"

                    # Без --build: образ уже собран предыдущим этапом под тегом ${APP_IMAGE_TAG},
                    # и стек должен поднять именно его, а не пересобранную копию.
                    docker compose -f "${COMPOSE_FILE}" \
                        --env-file "${ENV_FILE}" up -d
                    docker compose -f "${COMPOSE_FILE}" \
                        --env-file "${ENV_FILE}" images app gateway
                '''
            }
        }

        stage('Стек: готов') {
            steps {
                sh '''
                    for i in $(seq 1 60); do
                        if curl -sf "${BASE_URL}/actuator/health"; then
                            echo
                            exit 0
                        fi
                        sleep 2
                    done
                    echo "gateway не отдал /actuator/health за 120 с"
                    docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps
                    docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" logs --tail=120 app gateway
                    exit 1
                '''
            }
        }

        stage('API-автотесты') {
            steps {
                dir('shortener-autotests') {
                    sh 'mvn -B test -DbaseUrl=${BASE_URL}'
                }
            }
        }

        stage('Интерфейс: e2e') {
            steps {
                sh '''
                    # Отчёт прошлого прогона не должен попасть в артефакты этого: workspace между
                    # сборками не чистится, а каталог gitignored (.gitignore:28).
                    rm -rf shortener-web/playwright-report
                    # Имя контейнера глобальное на хосте, не в пространстве имён compose-проекта:
                    # прерванный предыдущий job оставляет «протёкший» web-e2e, а `docker cp` в
                    # post { always } выполняется на любом пути — без предочистки здесь в артефакты
                    # попал бы чужой старый отчёт, если первый шаг упал до создания контейнера.
                    docker rm -f web-e2e || true
                    # 429-сценарию нужен лимит 2 на пользователя. Автотесты этапа 4 отработали
                    # под 1000, теперь пересоздаём app с оверрайдом из shell-окружения.
                    RATE_LIMIT_CREATE_PER_MINUTE=2 docker compose -f "${COMPOSE_FILE}" \\
                        --env-file "${ENV_FILE}" up -d app
                    # Ждём приложение, а не nginx: /app/ отвечает из образа gateway сразу, тогда как
                    # перезапущенный Spring ещё 10-20 с не принимает /api — первый page.goto()
                    # поймал бы 502. Тот же пробник с той же диагностикой, что в стадии «Стек: готов».
                    for i in $(seq 1 60); do
                        if curl -sf "${BASE_URL}/actuator/health"; then
                            echo
                            exit 0
                        fi
                        sleep 2
                    done
                    echo "app не отдал /actuator/health за 120 с после пересоздания"
                    docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps
                    docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" logs --tail=120 app gateway
                    exit 1
                '''
                sh '''
                    curl -sf "${BASE_URL}/app/" >/dev/null            # бандл на месте: 200 из gateway
                    docker build -f shortener-web/Dockerfile --target e2e \\
                        -t shortener-web-e2e:${APP_IMAGE_TAG} shortener-web
                    # Имя контейнера уже очищено первым шагом: между шагами его никто не создаёт.
                    docker create --name web-e2e --add-host=host.docker.internal:host-gateway \\
                        -e E2E_BASE_URL=${BASE_URL} shortener-web-e2e:${APP_IMAGE_TAG}
                    # sh в Jenkins идёт с -e: голый `docker start -a …; rc=$?` оборвал бы скрипт
                    # до вытаскивания отчёта. В AND-OR списке -e не срабатывает, код сохраняется.
                    rc=0
                    docker start -a web-e2e || rc=$?
                    exit $rc
                '''
            }
            post {
                always {
                    // отчёт лежит внутри ФС контейнера: монтировать workspace демон не умеет,
                    // поэтому вытаскиваем docker cp и только потом удаляем контейнер
                    sh 'docker cp web-e2e:/web/playwright-report shortener-web/ || true'
                    sh 'docker rm -f web-e2e || true'
                    archiveArtifacts artifacts: 'shortener-web/playwright-report/**',
                                     allowEmptyArchive: true
                    // после удаления контейнера, иначе image rm только снимет тег
                    sh 'docker image rm -f shortener-web-e2e:${APP_IMAGE_TAG} || true'
                }
            }
        }
    }

    post {
        always {
            dir('shortener-autotests') {
                // Отчёт собирается даже когда тесты упали: без него сборка нечитаема.
                sh 'mvn -B allure:report || true'
            }
            archiveArtifacts artifacts: 'shortener-autotests/target/site/allure-maven-plugin/**',
                             allowEmptyArchive: true
            // -v удаляет и том с данными, чтобы следующий прогон начинался с чистой базы
            // и применённых заново миграций.
            sh 'docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" down -v || true'
            // Образы сборки удаляются по именам, а не `down --rmi local`: у --rmi local нет
            // фильтра по тегу и он заодно снёс бы shortener-jenkins:local, то есть пересборку
            // 71 запиненного плагина на следующем прогоне.
            sh 'docker image rm -f shortener-service:${APP_IMAGE_TAG} shortener-gateway:${APP_IMAGE_TAG} || true'
        }
        success {
            echo 'CI-стек удалён; артефакты сборки — Allure, JaCoCo, протоколы тестов.'
        }
    }
}
