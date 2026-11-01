# Jenkins для CI/CD этого проекта: образ с java 21, git, docker CLI + compose plugin и maven.
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

# Плагины не ставим: в lts-образ уже входит рекомендуемый набор (pipeline, git,
# credentials-binding, HTML Publisher), его хватает для Jenkinsfile. Если понадобится
# дополнительный — версия фиксируется числом и ставится так:
#   RUN jenkins-plugin-cli --plugins "example-plugin:1.2.3"

