package com.example.shortener.link;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.time.Instant;
import org.springframework.data.domain.Persistable;

/**
 * Короткая ссылка: код, адрес-оригинал, владелец и ограничения доступности.
 *
 * <p>Объект неизменяем после создания — сеттеров нет, «удаление» и списание кликов делаются
 * {@code UPDATE}-запросами в {@code LinkRepository}. Доступность выводится из {@code active},
 * {@code expiresAt} и {@code maxClicks}, а не хранится отдельным полем.
 */
@Entity
@Table(name = "links")
public class Link implements Persistable<Long> {

    @Id
    private Long id;

    /** Короткий код из пути: Base62 от id или пользовательский алиас; уникален по индексу. */
    @Column(nullable = false, length = 32)
    private String code;

    @Column(name = "original_url", nullable = false)
    private String originalUrl;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /**
     * Владелец ссылки. Колонка добавлена миграцией {@code V3} вместе с аутентификацией и осталась
     * nullable — у ссылок, созданных до неё, владельца нет.
     */
    @Column(name = "user_id")
    private Long userId;

    /** Момент, после которого ссылка отдаёт 410; {@code null} — бессрочная. */
    @Column(name = "expires_at")
    private Instant expiresAt;

    /** Лимит переходов; {@code null} — без лимита. Ссылки с лимитом не кэшируются. */
    @Column(name = "max_clicks")
    private Integer maxClicks;

    /**
     * Число списаний лимита: растёт атомарным {@code UPDATE} из {@code LinkRepository}, который
     * сервис вызывает только для ссылок с {@code maxClicks}. Полная статистика кликов живёт
     * в {@code click_events}, а не здесь.
     */
    @Column(name = "click_count", nullable = false)
    private int clickCount;

    @Column(name = "active", nullable = false)
    private boolean active;

    @Transient
    private final boolean isNew = true;

    protected Link() {
    }

    /**
     * Новая активная ссылка с нулевым счётчиком кликов. Id обязан быть передан — его берёт
     * {@code LinkRepository.nextId()}, поскольку из него делается код.
     */
    public Link(Long id, String code, String originalUrl, Instant createdAt, Long userId,
                Instant expiresAt, Integer maxClicks) {
        this.id = id;
        this.code = code;
        this.originalUrl = originalUrl;
        this.createdAt = createdAt;
        this.userId = userId;
        this.expiresAt = expiresAt;
        this.maxClicks = maxClicks;
        this.clickCount = 0;
        this.active = true;
    }

    @Override
    public Long getId() {
        return id;
    }

    /**
     * Всегда {@code true}: {@code Persistable} без этого признака заставил бы Hibernate на
     * {@code save} делать {@code UPDATE} по существующему id (id присваивается вручную из
     * последовательности), а нужен {@code INSERT}.
     */
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

    public Long getUserId() {
        return userId;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Integer getMaxClicks() {
        return maxClicks;
    }

    public int getClickCount() {
        return clickCount;
    }

    public boolean isActive() {
        return active;
    }
}
