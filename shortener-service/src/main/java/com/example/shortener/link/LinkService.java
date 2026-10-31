package com.example.shortener.link;

import com.example.shortener.common.Base62;
import com.example.shortener.common.NotFoundException;
import com.example.shortener.link.dto.CreateLinkRequest;
import com.example.shortener.link.dto.LinkResponse;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LinkService {

    private final LinkRepository links;
    private final String baseUrl;

    public LinkService(LinkRepository links, @Value("${app.base-url}") String baseUrl) {
        this.links = links;
        this.baseUrl = baseUrl;
    }

    @Transactional
    public LinkResponse create(CreateLinkRequest request) {
        String url = UrlValidator.requireHttpUrl(request.url());
        Long id = links.nextId();
        Link saved = links.save(new Link(id, Base62.encode(id), url, Instant.now()));
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public String originalUrl(String code) {
        return findLink(code).getOriginalUrl();
    }

    private Link findLink(String code) {
        return links.findByCode(code)
                .orElseThrow(() -> new NotFoundException("link not found: " + code));
    }

    private LinkResponse toResponse(Link link) {
        return new LinkResponse(link.getCode(), baseUrl + "/" + link.getCode(),
                link.getOriginalUrl(), link.getCreatedAt());
    }
}
