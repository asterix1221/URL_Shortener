package com.example.shortener.auth.dto;

/**
 * Успешный ответ входа. {@code accessToken} — строка JWT, которую клиент отправляет в
 * заголовке {@code Authorization: Bearer <токен>}, {@code expiresIn} — срок жизни токена в
 * секундах. Второе поле приходит из конфигурации ({@code app.jwt.ttl-seconds}) и не
 * пересчитывается из claims, поэтому равно полному TTL на момент выдачи.
 */
public record AuthResponse(String accessToken, long expiresIn) {
}
