package com.example.shortener.common;

/**
 * Превышен лимит создания ссылок. {@link ApiExceptionHandler} отвечает 429 Too Many
 * Requests и заголовком {@code Retry-After}, равным {@code retryAfterSeconds}.
 *
 * <p>Текст сообщения класс формирует сам, вызывающий код его не задаёт.
 */
public class RateLimitExceededException extends RuntimeException {

    private final long retryAfterSeconds;

    /**
     * @param retryAfterSeconds пауза в секундах, которую обработчик отдаст в
     *                          {@code Retry-After}; в сообщение она тоже попадает
     */
    public RateLimitExceededException(long retryAfterSeconds) {
        super("too many link creations, retry in " + retryAfterSeconds + "s");
        this.retryAfterSeconds = retryAfterSeconds;
    }

    /**
     * @return рекомендованная пауза в секундах до следующей попытки
     */
    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
