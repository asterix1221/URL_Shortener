package com.example.shortener.ratelimit;

import com.example.shortener.common.RateLimitExceededException;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Лимит создания ссылок на пользователя. Корзины живут в памяти процесса: при
 * нескольких экземплярах сервиса лимит считается на каждый экземпляр отдельно.
 */
@Component
public class CreateLinkRateLimiter {

    private final Map<Long, Bucket> buckets = new ConcurrentHashMap<>();
    private final long perMinute;

    public CreateLinkRateLimiter(@Value("${app.rate-limit.create-per-minute}") long perMinute) {
        this.perMinute = perMinute;
    }

    public void acquire(Long userId) {
        Bucket bucket = buckets.computeIfAbsent(userId, id -> newBucket());
        var probe = bucket.tryConsumeAndReturnRemaining(1);
        if (!probe.isConsumed()) {
            long retryAfter = Math.max(1, probe.getNanosToWaitForRefill() / 1_000_000_000);
            throw new RateLimitExceededException(retryAfter);
        }
    }

    private Bucket newBucket() {
        return Bucket.builder()
                .addLimit(Bandwidth.classic(perMinute, Refill.greedy(perMinute, Duration.ofMinutes(1))))
                .build();
    }
}
