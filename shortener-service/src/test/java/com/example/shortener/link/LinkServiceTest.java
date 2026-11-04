package com.example.shortener.link;

import com.example.shortener.cache.LinkCache;
import com.example.shortener.clicks.ClickEventMessage;
import com.example.shortener.clicks.ClickRecorder;
import com.example.shortener.common.Base62;
import com.example.shortener.common.BadRequestException;
import com.example.shortener.common.ConflictException;
import com.example.shortener.common.ForbiddenException;
import com.example.shortener.common.GoneException;
import com.example.shortener.common.InvalidUrlException;
import com.example.shortener.common.NotFoundException;
import com.example.shortener.link.dto.CreateLinkRequest;
import com.example.shortener.link.dto.LinkResponse;
import com.example.shortener.link.dto.LinkStatsResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LinkServiceTest {

    private static final Long USER_ID = 42L;
    private static final Long OTHER_USER_ID = 43L;

    @Mock
    private LinkRepository links;

    @Mock
    private ClickEventRepository clicks;

    @Mock
    private LinkCache cache;

    @Mock
    private ClickRecorder clickEvents;

    private LinkService service;

    @BeforeEach
    void createService() {
        // IpHasher здесь настоящий: тест проверяет, что в событие клика уходит 64-символьный
        // хэш, а не mock, который бы эту проверку обходил.
        service = new LinkService(links, clicks, cache, clickEvents, "http://localhost:8080",
                new IpHasher("test-salt"));
    }

    @Test
    void createsLinkWithGeneratedCodeFromSequence() {
        when(links.nextId()).thenReturn(100_000L);
        when(links.save(any(Link.class))).thenAnswer(invocation -> invocation.getArgument(0));

        LinkResponse response = service.create(USER_ID, new CreateLinkRequest("https://example.com/a", null, null, null));

        assertThat(response.code()).isEqualTo(Base62.encode(100_000L));
        assertThat(response.shortUrl()).endsWith("/" + response.code());
        assertThat(response.originalUrl()).isEqualTo("https://example.com/a");
        assertThat(response.active()).isTrue();

        ArgumentCaptor<Link> saved = ArgumentCaptor.forClass(Link.class);
        verify(links).save(saved.capture());
        assertThat(saved.getValue().getUserId()).isEqualTo(USER_ID);
        assertThat(saved.getValue().getId()).isEqualTo(100_000L);
    }

    @Test
    void createsLinkWithAlias() {
        when(links.nextId()).thenReturn(200_000L);
        when(links.existsByCode("my-alias")).thenReturn(false);
        when(links.save(any(Link.class))).thenAnswer(invocation -> invocation.getArgument(0));

        LinkResponse response = service.create(USER_ID,
                new CreateLinkRequest("https://example.com/a", "my-alias", null, null));

        assertThat(response.code()).isEqualTo("my-alias");
    }

    @Test
    void rejectsTakenAlias() {
        when(links.nextId()).thenReturn(1L);
        when(links.existsByCode("taken")).thenReturn(true);

        assertThatExceptionOfType(ConflictException.class)
                .isThrownBy(() -> service.create(USER_ID, new CreateLinkRequest("https://example.com", "taken", null, null)))
                .withMessageContaining("taken");
        verify(links, never()).save(any());
    }

    @Test
    void rejectsReservedAlias() {
        when(links.nextId()).thenReturn(1L);

        for (String reserved : List.of("api", "actuator", "swagger-ui")) {
            assertThatExceptionOfType(BadRequestException.class)
                    .isThrownBy(() -> service.create(USER_ID,
                            new CreateLinkRequest("https://example.com", reserved, null, null)))
                    .withMessageContaining("reserved");
        }
        // "v3" отсекается более ранней проверкой формата, но остаётся 400
        assertThatExceptionOfType(BadRequestException.class)
                .isThrownBy(() -> service.create(USER_ID,
                        new CreateLinkRequest("https://example.com", "v3", null, null)));
    }

    @Test
    void rejectsMalformedAlias() {
        when(links.nextId()).thenReturn(1L);

        for (String alias : List.of("ab", "a!", "a".repeat(33))) {
            assertThatExceptionOfType(BadRequestException.class)
                    .isThrownBy(() -> service.create(USER_ID,
                            new CreateLinkRequest("https://example.com", alias, null, null)))
                    .withMessageContaining("alias");
        }
    }

    @Test
    void rejectsInvalidUrl() {
        assertThatExceptionOfType(InvalidUrlException.class)
                .isThrownBy(() -> service.create(USER_ID, new CreateLinkRequest("ftp://example.com", null, null, null)));
    }

    @Test
    void rejectsExpirationInThePast() {
        when(links.nextId()).thenReturn(1L);
        Instant past = Instant.now().minusSeconds(60);

        assertThatExceptionOfType(BadRequestException.class)
                .isThrownBy(() -> service.create(USER_ID,
                        new CreateLinkRequest("https://example.com", null, past, null)))
                .withMessageContaining("expiresAt");
    }

    @Test
    void rejectsNonPositiveMaxClicks() {
        when(links.nextId()).thenReturn(1L);

        assertThatExceptionOfType(BadRequestException.class)
                .isThrownBy(() -> service.create(USER_ID,
                        new CreateLinkRequest("https://example.com", null, null, 0)))
                .withMessageContaining("maxClicks");
    }

    @Test
    void redirectReturnsOriginalUrlAndPublishesClick() {
        Link link = link("code1", USER_ID, true, null, null);
        when(links.findByCode("code1")).thenReturn(Optional.of(link));

        String target = service.redirect("code1", "203.0.113.5", "JUnit", "https://referrer.example.com");

        assertThat(target).isEqualTo("https://example.com/target");
        ArgumentCaptor<ClickEventMessage> event = ArgumentCaptor.forClass(ClickEventMessage.class);
        verify(clickEvents).record(event.capture());
        assertThat(event.getValue().linkId()).isEqualTo(link.getId());
        // click_count для ссылки без лимита больше не пишется из потока редиректа
        verify(links, never()).increaseClickCount(any());
        verify(cache).put(link);
    }

    @Test
    void cacheHitRedirectsWithoutTouchingDatabase() {
        when(cache.find("code1")).thenReturn(new LinkCache.Cached(7_000L, "https://cached.example.com"));

        String target = service.redirect("code1", "203.0.113.5", "JUnit", null);

        assertThat(target).isEqualTo("https://cached.example.com");
        verify(links, never()).findByCode(any());
        ArgumentCaptor<ClickEventMessage> event = ArgumentCaptor.forClass(ClickEventMessage.class);
        verify(clickEvents).record(event.capture());
        assertThat(event.getValue().linkId()).isEqualTo(7_000L);
    }

    @Test
    void linkWithMaxClicksUsesAtomicGuard() {
        Link link = link("limited", USER_ID, true, null, 5);
        when(links.findByCode("limited")).thenReturn(Optional.of(link));
        when(links.increaseClickCount(link.getId())).thenReturn(1);

        service.redirect("limited", "203.0.113.5", "JUnit", null);

        verify(links).increaseClickCount(link.getId());
    }

    @Test
    void storesHashedIpInsteadOfRawIp() {
        Link link = link("code1", USER_ID, true, null, null);
        when(links.findByCode("code1")).thenReturn(Optional.of(link));

        service.redirect("code1", "203.0.113.5", "JUnit-agent", "https://referrer.example.com/page");

        ArgumentCaptor<ClickEventMessage> event = ArgumentCaptor.forClass(ClickEventMessage.class);
        verify(clickEvents).record(event.capture());
        assertThat(event.getValue().ipHash()).hasSize(64).matches("[0-9a-f]{64}");
        assertThat(event.getValue().ipHash()).doesNotContain("203.0.113.5");
        assertThat(event.getValue().userAgent()).isEqualTo("JUnit-agent");
        assertThat(event.getValue().referrer()).isEqualTo("https://referrer.example.com/page");
    }

    @Test
    void redirectOfUnknownCodeIsNotFound() {
        when(links.findByCode("missing")).thenReturn(Optional.empty());

        assertThatExceptionOfType(NotFoundException.class)
                .isThrownBy(() -> service.redirect("missing", "127.0.0.1", null, null));
        verify(clickEvents, never()).record(any());
    }

    @Test
    void redirectOfInactiveExpiredOrExhaustedLinkIsGone() {
        assertGone(link("inactive", USER_ID, false, null, null));
        assertGone(link("expired", USER_ID, true, Instant.now().minusSeconds(10), null));
        assertGone(link("exhausted", USER_ID, true, null, 5));
    }

    private void assertGone(Link link) {
        when(links.findByCode(link.getCode())).thenReturn(Optional.of(link));
        when(links.increaseClickCount(link.getId())).thenReturn(0);

        assertThatExceptionOfType(GoneException.class)
                .isThrownBy(() -> service.redirect(link.getCode(), "127.0.0.1", null, null));
        verify(clickEvents, never()).record(any());
    }

    @Test
    void forbidsAccessToForeignLink() {
        Link link = link("foreign", OTHER_USER_ID, true, null, null);
        when(links.findByCode("foreign")).thenReturn(Optional.of(link));

        assertThatExceptionOfType(ForbiddenException.class)
                .isThrownBy(() -> service.getOwned(USER_ID, "foreign"));
        assertThatExceptionOfType(ForbiddenException.class)
                .isThrownBy(() -> service.stats(USER_ID, "foreign"));
        assertThatExceptionOfType(ForbiddenException.class)
                .isThrownBy(() -> service.delete(USER_ID, "foreign"));
        verify(links, never()).deactivate(anyLong());
    }

    @Test
    void missingLinkIsNotFoundForOwnerEndpoints() {
        when(links.findByCode("absent")).thenReturn(Optional.empty());

        assertThatExceptionOfType(NotFoundException.class).isThrownBy(() -> service.getOwned(USER_ID, "absent"));
        assertThatExceptionOfType(NotFoundException.class).isThrownBy(() -> service.stats(USER_ID, "absent"));
        assertThatExceptionOfType(NotFoundException.class).isThrownBy(() -> service.delete(USER_ID, "absent"));
    }

    @Test
    void deleteDeactivatesOwnLink() {
        Link link = link("mine", USER_ID, true, null, null);
        when(links.findByCode("mine")).thenReturn(Optional.of(link));

        service.delete(USER_ID, "mine");

        verify(links).deactivate(link.getId());
        verify(cache).evict("mine");
    }

    @Test
    void statsAggregatesDaysAndReferrers() {
        Link link = link("mine", USER_ID, true, null, null);
        when(links.findByCode("mine")).thenReturn(Optional.of(link));
        when(clicks.countByLinkId(link.getId())).thenReturn(4L);
        when(clicks.clicksByDay(link.getId())).thenReturn(List.of(
                new Object[]{java.sql.Date.valueOf(LocalDate.of(2026, 10, 30)), 3L},
                new Object[]{java.sql.Date.valueOf(LocalDate.of(2026, 10, 31)), 1L}));
        when(clicks.topReferrers(link.getId())).thenReturn(List.of(
                new Object[]{"https://x.com", 2L},
                new Object[]{"", 2L}));

        LinkStatsResponse stats = service.stats(USER_ID, "mine");

        assertThat(stats.code()).isEqualTo("mine");
        assertThat(stats.totalClicks()).isEqualTo(4L);
        assertThat(stats.byDay()).extracting(LinkStatsResponse.DailyClicks::date)
                .containsExactly(LocalDate.of(2026, 10, 30), LocalDate.of(2026, 10, 31));
        assertThat(stats.byDay().get(0).count()).isEqualTo(3L);
        assertThat(stats.topReferrers()).hasSize(2);
        assertThat(stats.topReferrers().get(0).referrer()).isEqualTo("https://x.com");
    }

    @Test
    void listMapsEntitiesToResponses() {
        Link link = link("mine", USER_ID, true, null, null);
        Page<Link> page = new PageImpl<>(List.of(link));
        when(links.findByUserId(eq(USER_ID), any(Pageable.class))).thenReturn(page);

        Page<LinkResponse> result = service.list(USER_ID, 0, 20);

        assertThat(result.getContent()).singleElement()
                .satisfies(response -> assertThat(response.shortUrl()).isEqualTo("http://localhost:8080/mine"));
    }

    @Test
    void blankIpProducesNullHash() {
        Link link = link("code1", USER_ID, true, null, null);
        when(links.findByCode("code1")).thenReturn(Optional.of(link));

        service.redirect("code1", "   ", "agent", null);

        ArgumentCaptor<ClickEventMessage> event = ArgumentCaptor.forClass(ClickEventMessage.class);
        verify(clickEvents).record(event.capture());
        assertThat(event.getValue().ipHash()).isNull();
    }

    private Link link(String code, Long ownerId, boolean active, Instant expiresAt, Integer maxClicks) {
        Link link = new Link(1_000L + code.hashCode(), code, "https://example.com/target",
                Instant.now(), ownerId, expiresAt, maxClicks);
        if (!active) {
            // деактивация в проде делается UPDATE-запросом, конструктор всегда создаёт активную
            ReflectionTestUtils.setField(link, "active", false);
        }
        return link;
    }
}
