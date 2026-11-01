-- Тестовые данные для нагрузочных сценариев (этап 6): 100 000 ссылок с кодами s_<n>.
-- Символ "_" в Base62-алфавит кодов не входит, поэтому такие коды не конфликтуют с
-- настоящими. Требует хотя бы одного пользователя (scripts/smoke.ps1) и пустой
-- выборки кодов: повторный запуск упадёт на уникальном индексе ux_links_code.
--
--   Get-Content scripts\seed.sql | docker compose -f infra\docker-compose.yml exec -T postgres psql -U shortener -d shortener
INSERT INTO links (id, code, original_url, user_id)
SELECT nextval('link_seq'), 's_' || g, 'https://example.com/page/' || g, (SELECT min(id) FROM users)
FROM generate_series(1, 100000) g;
