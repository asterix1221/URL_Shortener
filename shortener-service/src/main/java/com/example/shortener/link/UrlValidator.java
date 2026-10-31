package com.example.shortener.link;

import com.example.shortener.common.InvalidUrlException;
import java.net.URI;
import java.net.URISyntaxException;

public final class UrlValidator {

    private UrlValidator() {
    }

    public static String requireHttpUrl(String url) {
        if (url == null || url.isBlank()) {
            throw new InvalidUrlException("url: must be a valid http(s) URL");
        }
        URI uri;
        try {
            uri = new URI(url.trim());
        } catch (URISyntaxException ex) {
            throw new InvalidUrlException("url: must be a valid http(s) URL");
        }
        String scheme = uri.getScheme();
        boolean httpScheme = "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
        if (!httpScheme || uri.getHost() == null || uri.getHost().isBlank()) {
            throw new InvalidUrlException("url: must be a valid http(s) URL");
        }
        return url.trim();
    }
}
