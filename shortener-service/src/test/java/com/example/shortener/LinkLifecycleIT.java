package com.example.shortener;

import com.example.shortener.link.dto.LinkResponse;
import com.example.shortener.link.dto.LinkStatsResponse;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LinkLifecycleIT extends AbstractIT {

    @Test
    void createRedirectAndStoreSingleClickEvent() throws Exception {
        String token = registerAndLogin();
        LinkResponse link = createLink(token, Map.of("url", "https://example.com/target-1"));

        assertThat(link).isNotNull();
        assertThat(link.shortUrl()).endsWith("/" + link.code());
        assertThat(link.originalUrl()).isEqualTo("https://example.com/target-1");
        assertThat(link.active()).isTrue();

        HttpResponse<String> redirect = click(link.code(), "https://referrer.example.com/page");

        assertThat(redirect.statusCode()).isEqualTo(302);
        assertThat(redirect.headers().firstValue("Location")).hasValue("https://example.com/target-1");
        awaitClickEvents(link.code(), 1);
        // Счётчик кликов атомарно двигает только строка с лимитом: без maxClicks редирект
        // не обновляет links и не ждёт записи события.
        assertThat(clickCount(link.code())).isZero();
        assertThat(jdbc.queryForObject("""
                SELECT e.ip_hash FROM click_events e JOIN links l ON l.id = e.link_id WHERE l.code = ?
                """, String.class, link.code()))
                .hasSize(64).doesNotContain("127.0.0.1");
    }

    @Test
    void exhaustedLinkAnswersGoneAndCounterStopsAtLimit() throws Exception {
        String token = registerAndLogin();
        LinkResponse link = createLink(token, Map.of("url", "https://example.com/target-2", "maxClicks", 2));

        assertThat(click(link.code(), null).statusCode()).isEqualTo(302);
        assertThat(click(link.code(), null).statusCode()).isEqualTo(302);
        assertThat(click(link.code(), null).statusCode()).isEqualTo(410);

        assertThat(clickCount(link.code())).isEqualTo(2);
        awaitClickEvents(link.code(), 2);
    }

    @Test
    void deletedAndExpiredLinksAnswerGone() throws Exception {
        String token = registerAndLogin();
        LinkResponse deleted = createLink(token, Map.of("url", "https://example.com/target-deleted"));
        ResponseEntity<Void> remove = rest.exchange("/api/links/" + deleted.code(), HttpMethod.DELETE,
                new HttpEntity<>(bearer(token)), Void.class);
        assertThat(remove.getStatusCode().value()).isEqualTo(204);

        assertThat(click(deleted.code(), null).statusCode()).isEqualTo(410);

        LinkResponse expiring = createLink(token, Map.of("url", "https://example.com/target-expiring",
                "expiresAt", Instant.now().plusSeconds(1).toString()));
        Thread.sleep(1500);

        assertThat(click(expiring.code(), null).statusCode()).isEqualTo(410);
    }

    @Test
    void statsAggregateClicksByDayAndReferrer() throws Exception {
        String token = registerAndLogin();
        LinkResponse link = createLink(token, Map.of("url", "https://example.com/target-3"));

        click(link.code(), "https://same-referrer.example.com");
        click(link.code(), "https://same-referrer.example.com");
        click(link.code(), "https://other-referrer.example.com");
        click(link.code(), null);
        click(link.code(), null);
        awaitClickEvents(link.code(), 5);

        LinkStatsResponse stats = rest.exchange("/api/links/" + link.code() + "/stats", HttpMethod.GET,
                new HttpEntity<>(bearer(token)), LinkStatsResponse.class).getBody();

        assertThat(stats).isNotNull();
        assertThat(stats.code()).isEqualTo(link.code());
        assertThat(stats.totalClicks()).isEqualTo(5);
        assertThat(stats.totalClicks()).isEqualTo(clickEvents(link.code()));
        assertThat(stats.byDay()).singleElement().satisfies(day -> {
            assertThat(day.date()).isEqualTo(LocalDate.now(ZoneOffset.UTC));
            assertThat(day.count()).isEqualTo(5);
        });
        assertThat(stats.topReferrers()).filteredOn(r -> r.referrer().equals("https://same-referrer.example.com"))
                .singleElement().satisfies(r -> assertThat(r.count()).isEqualTo(2));
        assertThat(stats.topReferrers()).filteredOn(r -> r.referrer().isEmpty()).singleElement()
                .satisfies(r -> assertThat(r.count()).isEqualTo(2));
    }

    @Test
    void listPaginatesOwnLinks() {
        String token = registerAndLogin();
        List<String> created = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            created.add(createLink(token, Map.of("url", "https://example.com/pagination-" + i)).code());
        }

        ResponseEntity<Map<String, Object>> page = rest.exchange("/api/links?page=0&size=2", HttpMethod.GET,
                new HttpEntity<>(bearer(token)), new ParameterizedTypeReference<>() {
                });

        assertThat(page.getStatusCode().value()).isEqualTo(200);
        assertThat(page.getBody())
                .containsEntry("totalElements", 3)
                .containsEntry("size", 2)
                .hasEntrySatisfying("content", content -> assertThat(codes(content))
                        // Порядок — часть контракта, который читает UI: createdAt DESC, поэтому
                        // на первой странице две самые свежие ссылки (третья созданная впереди).
                        .containsExactly(created.get(2), created.get(1)));
    }

    @SuppressWarnings("unchecked")
    private static List<String> codes(Object content) {
        return ((List<Map<String, Object>>) content).stream().map(row -> (String) row.get("code")).toList();
    }
}
