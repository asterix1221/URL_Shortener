package com.example.shortener.cache;

import com.example.shortener.link.Link;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Cache-aside для редиректа. Ключ {@code link:<code>} хранит оригинальный URL,
 * {@code link-id:<code>} — id ссылки, нужный для события клика без похода в БД.
 */
@Component
public class LinkCache {

    private static final Logger log = LoggerFactory.getLogger(LinkCache.class);
    static final String URL_KEY = "link:";
    static final String ID_KEY = "link-id:";

    private final StringRedisTemplate redis;
    private final MeterRegistry metrics;
    private final long ttlSeconds;

    public LinkCache(StringRedisTemplate redis, MeterRegistry metrics,
                     @Value("${app.cache.ttl-seconds}") long ttlSeconds) {
        this.redis = redis;
        this.metrics = metrics;
        this.ttlSeconds = ttlSeconds;
    }

    public record Cached(Long linkId, String originalUrl) {
    }

    public Cached find(String code) {
        List<String> values;
        try {
            values = redis.opsForValue().multiGet(List.of(URL_KEY + code, ID_KEY + code));
        } catch (DataAccessException ex) {
            count("error");
            log.warn("redis unavailable for lookup of {}, falling back to database", code, ex);
            return null;
        }
        if (values == null || values.get(0) == null || values.get(1) == null) {
            count("miss");
            return null;
        }
        count("hit");
        return new Cached(Long.valueOf(values.get(1)), values.get(0));
    }

    public void put(Link link) {
        if (link.getMaxClicks() != null || !link.isActive()) {
            return;
        }
        Duration ttl = ttlFor(link);
        if (ttl.isZero() || ttl.isNegative()) {
            return;
        }
        try {
            redis.opsForValue().set(URL_KEY + link.getCode(), link.getOriginalUrl(), ttl);
            redis.opsForValue().set(ID_KEY + link.getCode(), String.valueOf(link.getId()), ttl);
        } catch (DataAccessException ex) {
            log.warn("cannot warm cache for {}", link.getCode(), ex);
        }
    }

    public void evict(String code) {
        try {
            redis.delete(List.of(URL_KEY + code, ID_KEY + code));
        } catch (DataAccessException ex) {
            log.warn("cannot evict cache for {}", code, ex);
        }
    }

    private Duration ttlFor(Link link) {
        long ttl = ttlSeconds;
        Instant expiresAt = link.getExpiresAt();
        if (expiresAt != null) {
            long untilExpiry = Math.max(0, Duration.between(Instant.now(), expiresAt).getSeconds());
            ttl = Math.min(ttl, untilExpiry);
        }
        return Duration.ofSeconds(ttl);
    }

    private void count(String result) {
        metrics.counter("shortener.cache.requests", "result", result).increment();
    }
}
