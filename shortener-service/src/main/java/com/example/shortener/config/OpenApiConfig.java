package com.example.shortener.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Настраивает сгенерированное описание OpenAPI: объявляет схему авторизации
 * {@code bearerAuth} (HTTP, bearer, формат {@code JWT}) и добавляет её глобальным
 * требованием безопасности, поэтому Swagger UI показывает замок у операций и поле
 * для Bearer-токена.
 *
 * <p>Своих свойств класс не читает — пути, схемы и ответы берутся из аннотаций
 * контроллеров и настроек springdoc.
 */
@Configuration
public class OpenApiConfig {

    private static final String SCHEME = "bearerAuth";

    /**
     * @return объект {@code OpenAPI} со схемой {@code bearerAuth} и глобальным
     *         требованием её использовать; схема описывает токен, но не проверяет его
     */
    @Bean
    public OpenAPI shortenerOpenApi() {
        return new OpenAPI()
                .components(new Components().addSecuritySchemes(SCHEME, new SecurityScheme()
                        .name(SCHEME)
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList(SCHEME));
    }
}
