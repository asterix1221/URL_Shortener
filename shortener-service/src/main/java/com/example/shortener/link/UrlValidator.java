package com.example.shortener.link;

import com.example.shortener.common.InvalidUrlException;
import java.net.URI;
import java.net.URISyntaxException;

/**
 * Проверка адреса-оригинала. Отдельный класс, а не аннотация валидации, потому что правило
 * «только http(s) и только с хостом» нужно сервису до сохранения, а не только на входе REST.
 */
public final class UrlValidator {

    private UrlValidator() {
    }

    /**
     * Возвращает адрес с обрезанными пробелами по краям — именно он уходит в базу, а не
     * исходная строка запроса.
     *
     * <p>Схема сравнивается без учёта регистра ({@code HTTPS} проходит), голые адреса вида
     * {@code example.com} отклоняются: у них нет схемы, и редирект на них был бы неоднозначным.
     *
     * @param url адрес из запроса; {@code null} и пустая строка недопустимы
     * @return тот же адрес без обрамляющих пробелов
     * @throws InvalidUrlException если адрес пуст, не разобран как URI, имеет схему не http(s)
     *                              или не содержит хоста
     */
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
