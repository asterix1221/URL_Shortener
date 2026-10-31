FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY .mvn .mvn
COPY mvnw pom.xml ./
COPY src src
# dependency:go-offline на холодном кэше resolves-ит плагины и test-зависимости и на этой машине
# не завершался за час; тёплый ~/.m2 через cache mount даёт тот же эффект и не блокирует сборку.
RUN --mount=type=cache,target=/root/.m2 ./mvnw -q -B package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
