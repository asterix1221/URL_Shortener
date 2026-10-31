package com.example.shortener.link;

import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LinkRepository extends JpaRepository<Link, Long> {

    Optional<Link> findByCode(String code);

    boolean existsByCode(String code);

    Page<Link> findByUserId(Long userId, Pageable pageable);

    @Query(value = "SELECT nextval('link_seq')", nativeQuery = true)
    Long nextId();

    @Modifying
    @Query(value = """
            UPDATE links SET click_count = click_count + 1
            WHERE id = :id AND active AND (expires_at IS NULL OR expires_at > now())
              AND (max_clicks IS NULL OR click_count < max_clicks)
            """, nativeQuery = true)
    int increaseClickCount(@Param("id") Long id);

    @Modifying
    @Query("UPDATE Link l SET l.active = false WHERE l.id = :id")
    int deactivate(@Param("id") Long id);
}
