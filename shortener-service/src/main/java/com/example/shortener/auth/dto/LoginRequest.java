package com.example.shortener.auth.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Тело запроса входа. Оба поля обязаны быть непустыми ({@code @NotBlank}), иначе
 * {@code @Valid} на контроллере остановит запрос до обращения к базе. Формат email, длина
 * пароля и прочие ограничения здесь не проверяются: вход оценивается по совпадению
 * BCrypt-хэша, поэтому несовпадение становится ошибкой аутентификации, а не валидации.
 */
public record LoginRequest(
        @NotBlank String email,
        @NotBlank String password
) {
}
