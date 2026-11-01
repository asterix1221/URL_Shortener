package com.example.shortener.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Настройки подписи JWT, привязанные к префиксу {@code app.jwt}: секрет
 * {@code app.jwt.secret} и срок жизни {@code app.jwt.ttl-seconds}; в
 * {@code application.yml} первый берётся из {@code JWT_SECRET} (по умолчанию пустой),
 * второй — из {@code JWT_TTL_SECONDS} (по умолчанию 3600). Проверки стоят в компактном
 * конструкторе, то есть срабатывают при связывании свойств на старте контекста, а не при
 * первом использовании: пустой или короче 32 байт UTF-8 секрет и нулевой либо
 * отрицательный срок жизни бросают {@link IllegalStateException}, и приложение не
 * поднимается. Длина секрета измеряется в байтах, поэтому нелатинские символы расходуют
 * её быстрее, чем кажется по числу знаков.
 */
@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(String secret, long ttlSeconds) {

    private static final int MIN_SECRET_BYTES = 32;

    public JwtProperties {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException("app.jwt.secret (JWT_SECRET) is not set");
        }
        if (secret.getBytes(java.nio.charset.StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("JWT_SECRET must be at least " + MIN_SECRET_BYTES + " bytes");
        }
        if (ttlSeconds <= 0) {
            throw new IllegalStateException("app.jwt.ttl-seconds must be positive");
        }
    }
}
