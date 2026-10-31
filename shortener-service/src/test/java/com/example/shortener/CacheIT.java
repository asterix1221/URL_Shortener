package com.example.shortener;

import com.example.shortener.link.dto.LinkResponse;
import io.micrometer.core.instrument.MeterRegistry;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

class CacheIT extends AbstractIT {

    @Autowired
    private StringRedisTemplate redis;

    @Autowired
    private MeterRegistry metrics;

    @Test
    void secondRedirectIsServedFromCache() throws Exception {
        String token = registerAndLogin();
        LinkResponse link = createLink(token, Map.of("url", "https://example.com/cached"));

        assertThat(click(link.code(), null).statusCode()).isEqualTo(302);
        Awaitility.await().atMost(Duration.ofSeconds(10)).until(() -> Boolean.TRUE.equals(redis.hasKey(urlKey(link))));
        assertThat(redis.opsForValue().get(urlKey(link))).isEqualTo("https://example.com/cached");
        assertThat(redis.getExpire(urlKey(link))).isBetween(1L, 3600L);

        // Меняем адрес в обход кэша: если редирект читает базу, клиент получит новое значение.
        jdbc.update("UPDATE links SET original_url = ? WHERE code = ?",
                "https://changed-in-database.example.com", link.code());

        // Реестр метрик переиспользуется контекстом Spring вместе с другими IT-классами,
        // поэтому сравниваем прирост счётчика, а не абсолютное значение.
        double hitsBefore = counter("hit");
        HttpResponse<String> second = click(link.code(), null);
        assertThat(second.statusCode()).isEqualTo(302);
        assertThat(second.headers().firstValue("Location")).hasValue("https://example.com/cached");
        assertThat(counter("hit") - hitsBefore).isEqualTo(1.0);
    }

    @Test
    void deleteEvictsCachedLink() throws Exception {
        String token = registerAndLogin();
        LinkResponse link = createLink(token, Map.of("url", "https://example.com/evicted"));

        click(link.code(), null);
        Awaitility.await().atMost(Duration.ofSeconds(10)).until(() -> Boolean.TRUE.equals(redis.hasKey(urlKey(link))));

        ResponseEntity<Void> remove = rest.exchange("/api/links/" + link.code(), HttpMethod.DELETE,
                new HttpEntity<>(bearer(token)), Void.class);
        assertThat(remove.getStatusCode().value()).isEqualTo(204);
        assertThat(redis.hasKey(urlKey(link))).isFalse();
        assertThat(redis.hasKey(idKey(link))).isFalse();

        // 410 не должно прогреть кэш обратно
        assertThat(click(link.code(), null).statusCode()).isEqualTo(410);
        assertThat(redis.hasKey(urlKey(link))).isFalse();
    }

    @Test
    void linkWithClickLimitIsNotCached() throws Exception {
        String token = registerAndLogin();
        LinkResponse link = createLink(token,
                Map.of("url", "https://example.com/limited", "maxClicks", 5));

        assertThat(click(link.code(), null).statusCode()).isEqualTo(302);
        // Кэш пропускает лимитированные ссылки: их доступность зависит от счётчика в базе.
        assertThat(redis.hasKey(urlKey(link))).isFalse();
        assertThat(redis.hasKey(idKey(link))).isFalse();
    }

    private String urlKey(LinkResponse link) {
        return "link:" + link.code();
    }

    private String idKey(LinkResponse link) {
        return "link-id:" + link.code();
    }

    private double counter(String result) {
        return metrics.counter("shortener.cache.requests", "result", result).count();
    }
}
