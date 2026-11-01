package com.example.shortener.link;

import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Доступ к таблице {@code links}. Помимо обычных finder'ов здесь два нативных запроса, которые
 * нельзя выразить через семантику JPA «прочитал — изменил — сохранил»: им нужен атомарный
 * {@code UPDATE} и прямой доступ к последовательности.
 */
public interface LinkRepository extends JpaRepository<Link, Long> {

    /** Единственный поиск по коду — по уникальному индексу {@code ux_links_code}. */
    Optional<Link> findByCode(String code);

    /** Проверка занятости алиаса перед сохранением. */
    boolean existsByCode(String code);

    /** Свои ссылки пользователя страницей; порядок внутри страницы БД не задаётся. */
    Page<Link> findByUserId(Long userId, Pageable pageable);

    /**
     * Следующий id из постгресной последовательности {@code link_seq}.
     *
     * <p>id нужен ДО вставки, потому что из него делается код ссылки (Base62): так два параллельных
     * создания не могут получить один код — значения последовательности уникальны и не откатываются
     * вместе с транзакцией.
     */
    @Query(value = "SELECT nextval('link_seq')", nativeQuery = true)
    Long nextId();

    /**
     * Атомарно увеличивает счётчик кликов, но только если ссылка всё ещё доступна: активна,
     * не просрочена и не исчерпала {@code maxClicks}.
     *
     * <p>Условие доступности живёт в самом {@code WHERE}, поэтому «проверить и списать» — один
     * запрос, и два параллельных клика на последнем разрешённом не обойдут лимит.
     *
     * @return число обновлённых строк: 0 означает «ссылка стала недоступна в этот момент»
     */
    @Modifying
    @Query(value = """
            UPDATE links SET click_count = click_count + 1
            WHERE id = :id AND active AND (expires_at IS NULL OR expires_at > now())
              AND (max_clicks IS NULL OR click_count < max_clicks)
            """, nativeQuery = true)
    int increaseClickCount(@Param("id") Long id);

    /**
     * Помечает ссылку удалённой ({@code active = false}) вместо DELETE: строка и её события
     * кликов остаются в базе.
     *
     * @return число обновлённых строк
     */
    @Modifying
    @Query("UPDATE Link l SET l.active = false WHERE l.id = :id")
    int deactivate(@Param("id") Long id);
}
