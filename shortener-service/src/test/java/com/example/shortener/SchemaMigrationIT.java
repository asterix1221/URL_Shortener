package com.example.shortener;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import jakarta.persistence.EntityManagerFactory;

import static org.assertj.core.api.Assertions.assertThat;

class SchemaMigrationIT extends AbstractIT {

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Test
    void flywayAppliedAllMigrationsOnEmptyDatabase() {
        List<Map<String, Object>> history = jdbc.queryForList(
                "SELECT version, success FROM flyway_schema_history ORDER BY installed_rank");

        assertThat(history).extracting(row -> row.get("version")).containsExactly("1", "2", "3", "4");
        assertThat(history).allSatisfy(row -> assertThat(row.get("success")).isEqualTo(true));
    }

    @Test
    void schemaMatchesEntitiesAndIndexes() {
        // контекст поднялся с ddl-auto=validate, значит сущности и таблицы согласованы
        assertThat(entityManagerFactory.getMetamodel().getEntities()).hasSize(3);

        assertThat(tableNames()).contains("links", "users", "click_events", "flyway_schema_history");
        assertThat(indexNames("links")).contains("ux_links_code", "ix_links_user");
        assertThat(indexNames("click_events")).contains("ix_click_events_link_ts");

        assertThat(columnTypes("links"))
                .containsEntry("code", "character varying")
                .containsEntry("original_url", "text")
                .containsEntry("click_count", "integer")
                .containsEntry("expires_at", "timestamp with time zone");

        assertThat(jdbc.queryForObject("""
                SELECT i.indisunique FROM pg_index i
                JOIN pg_class c ON c.oid = i.indexrelid
                WHERE c.relname = 'ux_links_code'
                """, Boolean.class)).isTrue();
    }

    @Test
    void linkSequenceFeedsBase62Codes() {
        String token = registerAndLogin();
        String first = createLink(token, Map.of("url", "https://example.com/seq-1")).code();
        String second = createLink(token, Map.of("url", "https://example.com/seq-2")).code();

        assertThat(first).isNotEqualTo(second);
        assertThat(jdbc.queryForObject("SELECT last_value FROM link_seq", Long.class)).isGreaterThan(100_000L);
    }

    private List<String> tableNames() {
        return jdbc.queryForList("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public'
                """, String.class);
    }

    private List<String> indexNames(String table) {
        return jdbc.queryForList("SELECT indexname FROM pg_indexes WHERE tablename = ?", String.class, table);
    }

    private Map<String, String> columnTypes(String table) {
        Map<String, String> types = new java.util.LinkedHashMap<>();
        org.springframework.jdbc.core.RowCallbackHandler collect =
                rs -> types.put(rs.getString(1), rs.getString(2));
        jdbc.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ?",
                collect, table);
        return types;
    }
}
