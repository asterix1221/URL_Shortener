package com.example.shortener.link;

import java.time.Instant;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LinkTest {

    @Test
    void newLinkStartsActiveAndWithoutClicks() {
        Link link = new Link(1L, "c1", "https://example.com/x", Instant.parse("2026-11-01T00:00:00Z"),
                42L, null, null);

        // Счётчик стартует с нуля и крутится только атомарным UPDATE в репозитории —
        // фиксация стартовых инвариантов, на которые опирается guard в increaseClickCount
        assertThat(link.getClickCount()).isZero();
        assertThat(link.isActive()).isTrue();
        assertThat(link.getMaxClicks()).isNull();
        assertThat(link.getExpiresAt()).isNull();
    }
}
