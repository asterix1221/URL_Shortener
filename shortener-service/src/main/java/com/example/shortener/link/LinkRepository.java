package com.example.shortener.link;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface LinkRepository extends JpaRepository<Link, Long> {

    Optional<Link> findByCode(String code);

    boolean existsByCode(String code);

    @Query(value = "SELECT nextval('link_seq')", nativeQuery = true)
    Long nextId();
}
