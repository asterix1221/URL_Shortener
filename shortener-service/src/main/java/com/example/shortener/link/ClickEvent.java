package com.example.shortener.link;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Один переход по короткой ссылке — строка журнала {@code click_events}, из которого потом
 * считается статистика.
 *
 * <p>Создаётся только консьюмером Kafka ({@code ClickEventWriter}), на пути редиректа его нет.
 * {@code clickedAt} приходит в самом событии, а не генерируется при вставке, поэтому время клика
 * соответствует переходу клиента, а не моменту, когда консьюмер до события добрался.
 */
@Entity
@Table(name = "click_events")
public class ClickEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "link_id", nullable = false)
    private Long linkId;

    @Column(name = "clicked_at", nullable = false)
    private Instant clickedAt;

    /**
     * SHA-256 от адреса клиента с солью из {@code app.ip-salt}; длина 64 — ровно hex-представление.
     * Сам IP в базу не пишется, обратное восстановление не предполагается.
     */
    @Column(name = "ip_hash", length = 64)
    private String ipHash;

    @Column(name = "user_agent")
    private String userAgent;

    @Column(name = "referrer")
    private String referrer;

    protected ClickEvent() {
    }

    public ClickEvent(Long linkId, Instant clickedAt, String ipHash, String userAgent, String referrer) {
        this.linkId = linkId;
        this.clickedAt = clickedAt;
        this.ipHash = ipHash;
        this.userAgent = userAgent;
        this.referrer = referrer;
    }

    public Long getLinkId() {
        return linkId;
    }

    public String getIpHash() {
        return ipHash;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public String getReferrer() {
        return referrer;
    }
}
