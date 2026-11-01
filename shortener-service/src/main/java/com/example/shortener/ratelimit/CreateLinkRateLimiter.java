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

    /**
     * Запоминает лимит, по которому потом строятся все корзины.
     *
     * @param perMinute значение {@code app.rate-limit.create-per-minute}; оно задаёт и ёмкость
     *                  корзины, и число токенов, возвращаемых за минуту, то есть лимит создания
     *                  ссылок на пользователя за период
     */
    public CreateLinkRateLimiter(@Value("${app.rate-limit.create-per-minute}") long perMinute) {
        this.perMinute = perMinute;
    }

    /**
     * Списывает один токен корзины пользователя, разрешая ему создать ссылку.
     *
     * <p>Корзина создаётся лениво при первом обращении к id и дальше живёт в памяти процесса:
     * счёт сбрасывается перезапуском, а разные экземпляры сервиса лимитируют пользователя каждый
     * сами. Пополнение {@code greedy} с интервалом в минуту, поэтому токены возвращаются
     * непрерывно, а не пачкой раз в минуту.
     *
     * @param userId идентификатор пользователя, чей лимит расходуется
     * @throws RateLimitExceededException если свободных токенов не хватило; в ней лежит
     *         {@code retryAfterSeconds} — целые секунды (округление вниз, но не меньше {@code 1})
     *         до возврата хотя бы одного токена. Обработчик ошибок отдаёт их как {@code 429} с
     *         заголовком {@code Retry-After}
     */
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
