package com.example.shortener.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Учётная запись: email, хэш пароля и момент регистрации. Ролей нет — доступ проверяется
 * принадлежностью ссылки, а не ролью.
 *
 * <p>Пароль в открытом виде нигде не хранится и не читается: {@code passwordHash} отдаёт
 * только {@code BCrypt}-хэш, сравнение делает {@code PasswordEncoder}. Смены пароля в сервисе
 * нет, поэтому сеттеров нет и запись после создания не меняется.
 *
 * <p>В отличие от {@code Link}, id здесь генерирует база ({@code IDENTITY} поверх
 * {@code BIGSERIAL}), а не берётся из последовательности заранее.
 */
@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Почта в нижнем регистре не нормализуется — её нормализует запрос
     * {@code UserRepository.findByEmailIgnoreCase}; уникальность по {@code lower(email)}
     * обеспечивается индексом {@code ux_users_email} в миграции {@code V2}.
     */
    @Column(nullable = false, length = 254)
    private String email;

    /** {@code BCrypt}-хэш длиной до 100 символов; сам пароль в базе отсутствует. */
    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected User() {
    }

    public User(String email, String passwordHash, Instant createdAt) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }
}
