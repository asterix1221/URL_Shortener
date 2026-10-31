CREATE TABLE click_events (
    id          BIGSERIAL    PRIMARY KEY,
    link_id     BIGINT       NOT NULL REFERENCES links (id),
    clicked_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ip_hash     VARCHAR(64),
    user_agent  TEXT,
    referrer    TEXT
);
CREATE INDEX ix_click_events_link_ts ON click_events (link_id, clicked_at);
