// Jenkins-пайплайн URL Shortener: сборка сервиса → тесты (unit + интеграционные на
// Testcontainers) → образ → полноценный стек в Docker Compose → API-автотесты → Allure.
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
        // Оверлей CI-стенда: gateway с запечённой конфигурацией вместо bind-монтирования.
        // Демон резолвит относительные пути монтирований в своей файловой системе, а workspace
        // с репозиторием есть только внутри контейнера Jenkins, поэтому базовый файл в CI
        // непроходим (подробности — в комментарии infra/docker-compose.ci.yml).
        COMPOSE_FILE_CI = 'infra/docker-compose.ci.yml'
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

        stage('Образ приложения') {
            steps {
                sh 'docker build -t shortener-service:${APP_IMAGE_TAG} shortener-service'
                sh 'docker image inspect shortener-service:${APP_IMAGE_TAG} --format "size={{.Size}} bytes"'

                // Gateway — конфиг внутри образа: его сборочный контекст клиент compose читает
                // сам и отдаёт демону потоком, поэтому путь из workspace доезжает до сборки.
                // Здесь ещё нет --env-file: infra/.env генерируется следующим этапом, а тег
                // берётся из окружения job'а (${APP_IMAGE_TAG} подставляется при интерполяции).
                sh 'docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_FILE_CI}" build gateway'
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
                    docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_FILE_CI}" \
                        --env-file "${ENV_FILE}" up -d
                    docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_FILE_CI}" \
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
                    docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_FILE_CI}" --env-file "${ENV_FILE}" ps
                    docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_FILE_CI}" --env-file "${ENV_FILE}" logs --tail=120 app gateway
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
            sh 'docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_FILE_CI}" --env-file "${ENV_FILE}" down -v || true'
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
