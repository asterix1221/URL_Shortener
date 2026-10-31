ALTER TABLE links
    ADD COLUMN user_id      BIGINT REFERENCES users (id),
    ADD COLUMN expires_at   TIMESTAMPTZ,
    ADD COLUMN max_clicks   INTEGER,
    ADD COLUMN click_count  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN active       BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX ix_links_user ON links (user_id);
