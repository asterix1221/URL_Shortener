package com.example.shortener.ratelimit;

import com.example.shortener.common.RateLimitExceededException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

class CreateLinkRateLimiterTest {

    @Test
    void allowsConfiguredNumberOfRequestsPerUser() {
        CreateLinkRateLimiter limiter = new CreateLinkRateLimiter(3);

        limiter.acquire(1L);
        limiter.acquire(1L);
        limiter.acquire(1L);

        assertThatExceptionOfType(RateLimitExceededException.class).isThrownBy(() -> limiter.acquire(1L));
    }

    @Test
    void rejectedRequestReportsRetryAfter() {
        CreateLinkRateLimiter limiter = new CreateLinkRateLimiter(1);

        limiter.acquire(1L);

        assertThatExceptionOfType(RateLimitExceededException.class)
                .isThrownBy(() -> limiter.acquire(1L))
                .satisfies(ex -> assertThat(ex.getRetryAfterSeconds()).isBetween(1L, 60L));
    }

    @Test
    void limitsAreIndependentPerUser() {
        CreateLinkRateLimiter limiter = new CreateLinkRateLimiter(1);

        limiter.acquire(1L);
        limiter.acquire(2L);

        assertThatExceptionOfType(RateLimitExceededException.class).isThrownBy(() -> limiter.acquire(1L));
    }
}
