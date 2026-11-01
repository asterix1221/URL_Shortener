# Jenkins для CI/CD этого проекта: образ с java 21, git, docker CLI + плагины compose/buildx и maven.
# Никаких apt-репозиториев и «latest»: всё, что нужно пайплайну, копируется из официально
# зафиксированных по версии образов.
FROM jenkins/jenkins:2.580.2-lts-jdk21

# docker CLI и плагин compose — чтобы job мог выполнять `docker build` и `docker compose`
# против хостового демона (сокет монтируется в docker-compose.yml).
COPY --from=docker:29.9.2-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:29.9.2-cli /usr/local/libexec/docker/cli-plugins/docker-compose \
     /usr/local/lib/docker/cli-plugins/docker-compose

# Maven нужен пайплайну напрямую; wrapper его тоже умеет, но скачивает дистрибутив на каждую
# чистую сборку. /usr/share/maven из официального образа — бинарный Maven 3.9 без сети.
COPY --from=maven:3.9.16-eclipse-temurin-21 /usr/share/maven /opt/maven
ENV MAVEN_HOME=/opt/maven \
    PATH="/opt/maven/bin:${PATH}"

# Setup-wizard отключён на уровне запуска JVM, а не только скриптом: если init.groovy не
# отработает, wizard оставит контейнер страницей «разблокировать», и job не создать скриптом.
ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false"

# Плагины. В lts-образ они НЕ входят (в /usr/share/jenkins/ref их ноль, и API
# pluginManager отдаёт пустой список), а без них не работает ни declarative-пайплайн
# (workflow-job/workflow-cps), ни git, ни шаг junit, ни timestamps(). Версии зафиксированы
# в plugins.txt числом — update center предлагает «самое свежее под ядро», и без файла
# пересборка образа давала бы другой набор каждый раз.
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt \
        --war /usr/share/jenkins/jenkins.war

# buildx — последним слоем, чтобы его добавление не сбрасывало кэш слоя с плагинами (иначе
# пересборка образа заново качает 71 плагин). Без него `docker build` в job идёт legacy-сборщиком
# и падает на RUN --mount=type=cache в shortener-service/Dockerfile:
# «the --mount option requires BuildKit».
COPY --from=docker:29.9.2-cli /usr/local/libexec/docker/cli-plugins/docker-buildx \
     /usr/local/lib/docker/cli-plugins/docker-buildx

