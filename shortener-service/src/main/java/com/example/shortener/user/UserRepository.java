package com.example.shortener.user;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/**
 * Доступ к таблице {@code users}. Пользователь здесь только регистрируется и входит:
 * ссылок репозиторий не касается, а список «моих ссылок» собирается через
 * {@code LinkRepository} по {@code user_id}.
 */
public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * Поиск почты без учёта регистра. Написан {@code @Query} с {@code lower()} с обеих сторон,
     * а не деривацией {@code EmailIgnoreCase}, потому что именно так он совпадает с
     * выражением уникального индекса {@code ux_users_email} и попадает в него.
     *
     * @param email почта без нормализации — приведение делает запрос
     * @return запись, если почта занята; {@code Optional.empty()}, если нет
     */
    @Query("select u from User u where lower(u.email) = lower(:email)")
    Optional<User> findByEmailIgnoreCase(String email);
}
