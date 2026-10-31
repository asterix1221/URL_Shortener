CREATE SEQUENCE link_seq START WITH 100000 INCREMENT BY 1;

CREATE TABLE links (
    id           BIGINT       PRIMARY KEY,
    code         VARCHAR(32)  NOT NULL,
    original_url TEXT         NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_links_code ON links (code);
