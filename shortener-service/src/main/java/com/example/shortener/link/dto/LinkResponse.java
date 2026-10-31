package com.example.shortener.link.dto;

import java.time.Instant;

public record LinkResponse(String code, String shortUrl, String originalUrl, Instant createdAt) {
}
