package com.example.shortener.link;

import com.example.shortener.cache.LinkCache;
import com.example.shortener.clicks.ClickEventMessage;
import com.example.shortener.clicks.ClickEventPublisher;
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
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LinkService {

    private static final Pattern ALIAS_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{3,32}$");
    private static final Set<String> RESERVED_CODES = Set.of("api", "actuator", "swagger-ui", "v3");

    private final LinkRepository links;
    private final ClickEventRepository clicks;
    private final LinkCache cache;
    private final ClickEventPublisher clickEvents;
    private final String baseUrl;
    private final IpHasher ipHasher;

    public LinkService(LinkRepository links, ClickEventRepository clicks, LinkCache cache,
                       ClickEventPublisher clickEvents,
                       @Value("${app.base-url}") String baseUrl,
                       IpHasher ipHasher) {
        this.links = links;
        this.clicks = clicks;
        this.cache = cache;
        this.clickEvents = clickEvents;
        this.baseUrl = baseUrl;
        this.ipHasher = ipHasher;
    }

    @Transactional
    public LinkResponse create(Long userId, CreateLinkRequest request) {
        String url = UrlValidator.requireHttpUrl(request.url());
        Instant expiresAt = request.expiresAt();
        if (expiresAt != null && !expiresAt.isAfter(Instant.now())) {
            throw new BadRequestException("expiresAt: must be in the future");
        }
        Integer maxClicks = request.maxClicks();
        if (maxClicks != null && maxClicks < 1) {
            throw new BadRequestException("maxClicks: must be greater than or equal to 1");
        }

        String alias = request.alias();
        Long id = links.nextId();
        String code;
        if (alias == null || alias.isBlank()) {
            code = Base62.encode(id);
        } else {
            if (!ALIAS_PATTERN.matcher(alias).matches()) {
                throw new BadRequestException("alias: must match ^[A-Za-z0-9_-]{3,32}$");
            }
            if (RESERVED_CODES.contains(alias.toLowerCase())) {
                throw new BadRequestException("alias: reserved word " + alias);
            }
            if (links.existsByCode(alias)) {
                throw new ConflictException("alias already taken: " + alias);
            }
            code = alias;
        }

        Link saved = links.save(new Link(id, code, url, Instant.now(), userId, expiresAt, maxClicks));
        return toResponse(saved);
    }

    @Transactional
    public String redirect(String code, String ip, String userAgent, String referrer) {
        LinkCache.Cached cached = cache.find(code);
        if (cached != null) {
            publishClick(cached.linkId(), ip, userAgent, referrer);
            return cached.originalUrl();
        }

        Link link = links.findByCode(code)
                .orElseThrow(() -> new NotFoundException("link not found: " + code));
        if (!link.isActive() || (link.getExpiresAt() != null && !link.getExpiresAt().isAfter(Instant.now()))) {
            throw new GoneException("link is not available: " + code);
        }
        // атомарный guard нужен только ссылкам с лимитом кликов: он же и проверяет доступность
        if (link.getMaxClicks() != null && links.increaseClickCount(link.getId()) == 0) {
            throw new GoneException("link is not available: " + code);
        }
        cache.put(link);
        publishClick(link.getId(), ip, userAgent, referrer);
        return link.getOriginalUrl();
    }

    private void publishClick(Long linkId, String ip, String userAgent, String referrer) {
        clickEvents.publish(new ClickEventMessage(linkId, Instant.now(), ipHasher.hash(ip), userAgent, referrer));
    }

    @Transactional(readOnly = true)
    public Page<LinkResponse> list(Long userId, int page, int size) {
        return links.findByUserId(userId, PageRequest.of(page, size)).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public LinkResponse getOwned(Long userId, String code) {
        return toResponse(requireOwned(userId, code));
    }

    @Transactional
    public void delete(Long userId, String code) {
        Link link = requireOwned(userId, code);
        links.deactivate(link.getId());
        cache.evict(code);
    }

    @Transactional(readOnly = true)
    public LinkStatsResponse stats(Long userId, String code) {
        Link link = requireOwned(userId, code);
        List<LinkStatsResponse.DailyClicks> byDay = clicks.clicksByDay(link.getId()).stream()
                .map(row -> new LinkStatsResponse.DailyClicks(toLocalDate(row[0]), ((Number) row[1]).longValue()))
                .toList();
        List<LinkStatsResponse.ReferrerClicks> top = clicks.topReferrers(link.getId()).stream()
                .map(row -> new LinkStatsResponse.ReferrerClicks((String) row[0], ((Number) row[1]).longValue()))
                .toList();
        return new LinkStatsResponse(link.getCode(), clicks.countByLinkId(link.getId()), byDay, top);
    }

    private Link requireOwned(Long userId, String code) {
        Link link = links.findByCode(code)
                .orElseThrow(() -> new NotFoundException("link not found: " + code));
        if (!link.getUserId().equals(userId)) {
            throw new ForbiddenException("access denied for link: " + code);
        }
        return link;
    }

    private LocalDate toLocalDate(Object day) {
        return ((java.sql.Date) day).toLocalDate();
    }

    private LinkResponse toResponse(Link link) {
        return new LinkResponse(link.getCode(), baseUrl + "/" + link.getCode(), link.getOriginalUrl(),
                link.getCreatedAt(), link.getExpiresAt(), link.getMaxClicks(), link.isActive());
    }
}
