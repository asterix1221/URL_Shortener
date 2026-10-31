package com.example.shortener.autotests.model;

import java.time.Instant;

public record LinkResponse(String code, String shortUrl, String originalUrl, Instant createdAt,
                           Instant expiresAt, Integer maxClicks, boolean active) {
}
