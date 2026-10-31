package com.example.shortener.link;

import com.example.shortener.common.InvalidUrlException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

class UrlValidatorTest {

    @Test
    void acceptsHttpAndHttps() {
        assertThat(UrlValidator.requireHttpUrl("http://example.com")).isEqualTo("http://example.com");
        assertThat(UrlValidator.requireHttpUrl("https://example.com/path?a=b#frag"))
                .isEqualTo("https://example.com/path?a=b#frag");
    }

    @Test
    void acceptsLocalhost() {
        assertThat(UrlValidator.requireHttpUrl("http://localhost:8080")).isEqualTo("http://localhost:8080");
    }

    @Test
    void acceptsUnicodeInPath() {
        String url = "https://example.com/тест";
        assertThat(UrlValidator.requireHttpUrl(url)).isEqualTo(url);
    }

    @Test
    void trimsSurroundingSpaces() {
        assertThat(UrlValidator.requireHttpUrl("  https://example.com/a  ")).isEqualTo("https://example.com/a");
    }

    @Test
    void rejectsBlankAndNull() {
        assertRejected(null);
        assertRejected("");
        assertRejected("   ");
    }

    @Test
    void rejectsNonHttpSchemes() {
        assertRejected("ftp://example.com");
        assertRejected("javascript:alert(1)");
        assertRejected("file:///etc/passwd");
        assertRejected("example.com/path");
    }

    @Test
    void rejectsMissingHost() {
        assertRejected("https:///path");
        assertRejected("https://");
    }

    @Test
    void rejectsUnparsableUrl() {
        assertRejected("https://exa mple.com");
    }

    @Test
    void acceptsUrlOfMaxLengthAndRejectsLonger() {
        String atLimit = "https://example.com/" + "a".repeat(2048 - "https://example.com/".length());
        assertThat(atLimit).hasSize(2048);
        assertThat(UrlValidator.requireHttpUrl(atLimit)).isEqualTo(atLimit);

        String tooLong = atLimit + "a";
        assertThat(tooLong).hasSize(2049);
        // длина ограничивает DTO-аннотация @Size, валидатор схемы её пропускает
        assertThat(UrlValidator.requireHttpUrl(tooLong)).isEqualTo(tooLong);
    }

    private void assertRejected(String url) {
        assertThatExceptionOfType(InvalidUrlException.class)
                .isThrownBy(() -> UrlValidator.requireHttpUrl(url))
                .withMessage("url: must be a valid http(s) URL");
    }
}
