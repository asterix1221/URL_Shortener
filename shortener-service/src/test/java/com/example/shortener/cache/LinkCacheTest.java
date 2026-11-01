package com.example.shortener.cache;

import com.example.shortener.link.Link;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LinkCacheTest {

    @Mock
    private StringRedisTemplate redis;

    @Mock
    private ValueOperations<String, String> values;

    private SimpleMeterRegistry metrics;
    private LinkCache cache;

    @BeforeEach
    void createCache() {
        when(redis.opsForValue()).thenReturn(values);
        metrics = new SimpleMeterRegistry();
        cache = new LinkCache(redis, metrics, 3600);
    }

    @Test
    void hitReturnsCachedLinkAndCountsHit() {
        when(values.multiGet(List.of("link:c1", "link-id:c1"))).thenReturn(List.of("https://example.com/x", "17"));

        LinkCache.Cached cached = cache.find("c1");

        assertThat(cached).isNotNull();
        assertThat(cached.originalUrl()).isEqualTo("https://example.com/x");
        assertThat(cached.linkId()).isEqualTo(17L);
        assertThat(count("hit")).isEqualTo(1.0);
    }

    @Test
    void missCountsMiss() {
        when(values.multiGet(anyList())).thenReturn(Arrays.asList(null, null));

        assertThat(cache.find("c1")).isNull();
        assertThat(count("miss")).isEqualTo(1.0);
    }

    @Test
    void redisFailureCountsErrorAndFallsBack() {
        when(values.multiGet(anyList())).thenThrow(new DataAccessResourceFailureException("redis down"));

        assertThat(cache.find("c1")).isNull();
        assertThat(count("error")).isEqualTo(1.0);
    }

    @Test
    void linkWithMaxClicksIsNotCached() {
        cache.put(link("c1", true, null, 5));

        verify(values, never()).set(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void inactiveLinkIsNotCached() {
        cache.put(link("c1", false, null, null));

        verify(values, never()).set(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void ttlIsCappedByCacheTtl() {
        cache.put(link("c1", true, null, null));

        ArgumentCaptor<Duration> ttl = ArgumentCaptor.forClass(Duration.class);
        verify(values).set(eq("link:c1"), eq("https://example.com/x"), ttl.capture());
        verify(values).set(eq("link-id:c1"), anyString(), any(Duration.class));
        assertThat(ttl.getValue()).isEqualTo(Duration.ofSeconds(3600));
    }

    @Test
    void ttlIsShortenedToLinkExpiry() {
        cache.put(link("c1", true, Instant.now().plusSeconds(30), null));

        ArgumentCaptor<Duration> ttl = ArgumentCaptor.forClass(Duration.class);
        verify(values).set(eq("link:c1"), anyString(), ttl.capture());
        assertThat(ttl.getValue().getSeconds()).isBetween(28L, 30L);
    }

    @Test
    void expiredLinkIsNotCached() {
        // без заглушки вызов set() вернул бы null, и тест ловил бы не «не положили в кэш»,
        // а случайное NPE в обёртке
        doNothing().when(values).set(anyString(), anyString(), any(Duration.class));

        // expiresAt в прошлом: ttlFor отдаёт 0 (Math.max с нулём), и класть в Redis нечего —
        // такой ключ сразу стал бы мусором, а редирект по нему всё равно отвечает 410
        cache.put(link("c1", true, Instant.now().minusSeconds(60), null));

        verify(values, never()).set(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void putSurvivesRedisOutage() {
        doThrow(new DataAccessResourceFailureException("redis down"))
                .when(values).set(anyString(), anyString(), any(Duration.class));

        // запись в кэш не должна ронять редирект: данные уже прочитаны из базы
        assertThatCode(() -> cache.put(link("c1", true, null, null))).doesNotThrowAnyException();
    }

    @Test
    void evictRemovesBothKeys() {
        cache.evict("c1");

        verify(redis).delete(List.of("link:c1", "link-id:c1"));
    }

    @Test
    void evictSurvivesRedisOutage() {
        when(redis.delete(anyList())).thenThrow(new DataAccessResourceFailureException("redis down"));

        cache.evict("c1");
    }

    private double count(String result) {
        return metrics.counter("shortener.cache.requests", "result", result).count();
    }

    private Link link(String code, boolean active, Instant expiresAt, Integer maxClicks) {
        Link link = new Link(1L, code, "https://example.com/x", Instant.now(), 42L, expiresAt, maxClicks);
        if (!active) {
            // деактивация в проде делается UPDATE-запросом, конструктор всегда создаёт активную
            ReflectionTestUtils.setField(link, "active", false);
        }
        return link;
    }
}
