package com.example.shortener.link;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Доступ к таблице {@code click_events} — журнал переходов, который пишет консьюмер Kafka.
 *
 * <p>Агрегаты для статистики считаются нативными запросами прямо в Postgres: переносить выборку по
 * дням и топ referrer'ов в приложение означало бы тянуть весь журнал по строке и считать его в JVM.
 * Формы {@code List<Object[]>} — обратная сторона нативного запроса без DTO-проекций.
 */
public interface ClickEventRepository extends JpaRepository<ClickEvent, Long> {

    /** Всего кликов по ссылке; считается по журналу, а не по счётчику в {@code links}. */
    long countByLinkId(Long linkId);

    /**
     * Клики по дням, отсортированные по дате.
     *
     * <p>Граница дня — UTC ({@code date_trunc} с явной зоной), чтобы счёт не зависел от настроек
     * сессии соединения.
     *
     * @return строки вида {@code [java.sql.Date, Long]}: день и число кликов
     */
    @Query(value = """
            SELECT (date_trunc('day', clicked_at AT TIME ZONE 'UTC'))::date AS day, count(*) AS clicks
            FROM click_events WHERE link_id = :linkId
            GROUP BY 1 ORDER BY 1
            """, nativeQuery = true)
    List<Object[]> clicksByDay(@Param("linkId") Long linkId);

    /**
     * Десять самых частых referrer'ов; ссылки без referrer'а группируются вокруг пустой строки
     * ({@code COALESCE}), а не выпадают из статистики.
     *
     * @return строки вида {@code [String, Long]}: referrer и число кликов
     */
    @Query(value = """
            SELECT COALESCE(referrer, '') AS referrer, count(*) AS clicks
            FROM click_events WHERE link_id = :linkId
            GROUP BY 1 ORDER BY count(*) DESC LIMIT 10
            """, nativeQuery = true)
    List<Object[]> topReferrers(@Param("linkId") Long linkId);
}
