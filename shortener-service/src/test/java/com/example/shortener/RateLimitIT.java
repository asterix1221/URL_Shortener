package com.example.shortener;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

// Отдельный контекст: лимит нужно уменьшить, а не выставлять его абсолютным значением
// в минутах ожидания.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "app.jwt.secret=integration-tests-secret-value-32-bytes!",
                "app.ip-salt=integration-ip-salt",
                "app.rate-limit.create-per-minute=2"
        })
class RateLimitIT extends AbstractIT {

    @Test
    void thirdCreateIsRejectedWithRetryAfter() {
        String token = registerAndLogin();

        assertThat(create(token, 1).getStatusCode().value()).isEqualTo(201);
        assertThat(create(token, 2).getStatusCode().value()).isEqualTo(201);

        ResponseEntity<String> limited = create(token, 3);
        assertThat(limited.getStatusCode().value()).isEqualTo(429);

        String retryAfter = limited.getHeaders().getFirst(HttpHeaders.RETRY_AFTER);
        assertThat(retryAfter).isNotNull();
        assertThat(Integer.parseInt(retryAfter)).isBetween(1, 60);
        assertThat(limited.getBody()).contains("Too Many Requests")
                .contains("too many link creations");
    }

    @Test
    void limitIsCountedPerUserNotGlobally() {
        String first = registerAndLogin();
        String second = registerAndLogin();

        assertThat(create(first, 1).getStatusCode().value()).isEqualTo(201);
        assertThat(create(first, 2).getStatusCode().value()).isEqualTo(201);
        // Другой пользователь получает собственную корзину, а не остаток чужой.
        assertThat(create(second, 1).getStatusCode().value()).isEqualTo(201);
        assertThat(create(second, 2).getStatusCode().value()).isEqualTo(201);
        assertThat(create(second, 3).getStatusCode().value()).isEqualTo(429);
    }

    private ResponseEntity<String> create(String token, int sequence) {
        return rest.exchange("/api/links", HttpMethod.POST,
                new HttpEntity<>(Map.of("url", "https://example.com/rate-limit-" + sequence), bearer(token)),
                String.class);
    }
}
