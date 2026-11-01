package com.example.shortener.link;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class IpHasherTest {

    private static final String SALT = "test-salt";

    @Test
    void hashesIpWithSaltIntoLowerCaseHex() {
        IpHasher hasher = new IpHasher(SALT);

        String hash = hasher.hash("203.0.113.5");

        // Контрольная точка посчитана вне теста:
        // printf '%s' '203.0.113.5test-salt' | openssl dgst -sha256 -r
        // Соль входит в хэш, поэтому один и тот же адрес на стендах с разным IP_SALT не сопоставим.
        assertThat(hash).isEqualTo("6bf4ae0d48df090f4c99d0e1ede9ea6564e7198dd2914b9b89fd129112f01941");
        assertThat(hash).hasSize(64).matches("[0-9a-f]{64}");
    }

    @Test
    void sameIpHashesDifferentlyWithDifferentSalt() {
        assertThat(new IpHasher(SALT).hash("203.0.113.5"))
                .isNotEqualTo(new IpHasher("other-salt").hash("203.0.113.5"));
    }

    @Test
    void missingAddressIsNotHashed() {
        IpHasher hasher = new IpHasher(SALT);

        // редирект без X-Forwarded-For и без RemoteAddr: в статистике остаётся пустой адрес,
        // хэш от пустой строки вместо этого выглядел бы как один «анонимный» посетитель
        assertThat(hasher.hash(null)).isNull();
        assertThat(hasher.hash("   ")).isNull();
    }

    @Test
    void unavailableAlgorithmFailsLoudly() {
        IpHasher hasher = new IpHasher(SALT, () -> {
            throw new NoSuchAlgorithmException("SHA-256");
        });

        // В проде ветка не срабатывает: SHA-256 обязателен по спецификации JVM. Проверка
        // держит поведение на месте — молча не хэшировать нельзя, адрес уходит в событие клика.
        assertThatThrownBy(() -> hasher.hash("203.0.113.5"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("SHA-256 is not available")
                .hasCauseInstanceOf(NoSuchAlgorithmException.class);
    }

    @Test
    void digestIsCreatedPerCall() {
        int[] created = {0};
        IpHasher hasher = new IpHasher(SALT, () -> {
            created[0]++;
            return MessageDigest.getInstance("SHA-256");
        });

        // MessageDigest не потокобезопасен: общий instance на два потока дал бы битый хэш
        hasher.hash("203.0.113.5");
        hasher.hash("198.51.100.9");

        assertThat(created[0]).isEqualTo(2);
    }
}
