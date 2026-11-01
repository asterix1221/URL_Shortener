package com.example.shortener.auth;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtPropertiesTest {

    @Test
    void acceptsSecretOfAtLeast32Bytes() {
        // ровно нижняя граница HS256: 32 символа по одному байту в UTF-8
        JwtProperties properties = new JwtProperties("01234567890123456789012345678901", 3600);

        assertThat(properties.secret()).hasSize(32);
        assertThat(properties.ttlSeconds()).isEqualTo(3600);
    }

    @Test
    void rejectsMissingSecret() {
        assertThatThrownBy(() -> new JwtProperties(null, 3600))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("app.jwt.secret (JWT_SECRET) is not set");

        assertThatThrownBy(() -> new JwtProperties("   ", 3600))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("app.jwt.secret (JWT_SECRET) is not set");
    }

    @Test
    void rejectsShortSecret() {
        assertThatThrownBy(() -> new JwtProperties("too-short-secret", 3600))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("JWT_SECRET must be at least 32 bytes");
    }

    @Test
    void secretLengthIsMeasuredInBytesNotCharacters() {
        // Ключ подписи HMAC считается в байтах: 20 кириллических символов — это 40 байт в UTF-8,
        // и такой секрет валиден, хотя «20 символов» звучало бы как отказ по лимиту 32.
        String cyrillic = "секретподписитокенов";
        assertThat(cyrillic.getBytes(java.nio.charset.StandardCharsets.UTF_8)).hasSizeGreaterThanOrEqualTo(32);

        assertThat(new JwtProperties(cyrillic, 60).secret()).isEqualTo(cyrillic);
    }

    @Test
    void rejectsNonPositiveTtl() {
        assertThatThrownBy(() -> new JwtProperties("integration-tests-secret-value-32-bytes!", 0))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("app.jwt.ttl-seconds must be positive");

        assertThatThrownBy(() -> new JwtProperties("integration-tests-secret-value-32-bytes!", -1))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("app.jwt.ttl-seconds must be positive");
    }
}
