package com.example.shortener.link;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.time.Instant;
import org.springframework.data.domain.Persistable;

@Entity
@Table(name = "links")
public class Link implements Persistable<Long> {

    @Id
    private Long id;

    @Column(nullable = false, length = 32)
    private String code;

    @Column(name = "original_url", nullable = false)
    private String originalUrl;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Transient
    private boolean isNew = true;

    protected Link() {
    }

    public Link(Long id, String code, String originalUrl, Instant createdAt) {
        this.id = id;
        this.code = code;
        this.originalUrl = originalUrl;
        this.createdAt = createdAt;
    }

    @Override
    public Long getId() {
        return id;
    }

    @Override
    @Transient
    public boolean isNew() {
        return isNew;
    }

    public String getCode() {
        return code;
    }

    public String getOriginalUrl() {
        return originalUrl;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
