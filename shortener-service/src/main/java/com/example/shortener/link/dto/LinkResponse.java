package com.example.shortener.link.dto;

import java.time.Instant;

/**
 * Ссылка так, как её видит владелец: при создании, в списке и в ответе на запрос одной ссылки.
 *
 * <p>{@code shortUrl} собирается на сервере из {@code app.base-url} и кода, поэтому он не
 * зависит от заголовков запроса. {@code active} отличает деактивированную («удалённую») ссылку
 * от просроченной: у второй срок виден по {@code expiresAt}.
 */
public record LinkResponse(String code, String shortUrl, String originalUrl, Instant createdAt,
                           Instant expiresAt, Integer maxClicks, boolean active) {
}
