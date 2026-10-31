package com.example.shortener.link;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClickEventRepository extends JpaRepository<ClickEvent, Long> {

    long countByLinkId(Long linkId);

    @Query(value = """
            SELECT (date_trunc('day', clicked_at AT TIME ZONE 'UTC'))::date AS day, count(*) AS clicks
            FROM click_events WHERE link_id = :linkId
            GROUP BY 1 ORDER BY 1
            """, nativeQuery = true)
    List<Object[]> clicksByDay(@Param("linkId") Long linkId);

    @Query(value = """
            SELECT COALESCE(referrer, '') AS referrer, count(*) AS clicks
            FROM click_events WHERE link_id = :linkId
            GROUP BY 1 ORDER BY count(*) DESC LIMIT 10
            """, nativeQuery = true)
    List<Object[]> topReferrers(@Param("linkId") Long linkId);
}
