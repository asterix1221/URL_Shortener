package com.example.shortener.clicks;

import java.time.Instant;

/** Событие клика в топике {@code click-events}. */
public record ClickEventMessage(Long linkId, Instant clickedAt, String ipHash, String userAgent, String referrer) {
}
