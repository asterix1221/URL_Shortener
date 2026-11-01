package com.example.shortener.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Тело запроса регистрации. Email обязан быть непустым, проходить {@code @Email} и не
 * превышать 254 символа; пароль — непустая строка от 8 до 72 символов. Нарушение любого из
 * этих ограничений даёт {@code 400} ещё до {@code AuthService}, а занятый email
 * обнаруживается уже в сервисе и превращается в {@code 409}.
 */
public record RegisterRequest(
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Size(min = 8, max = 72) String password
) {
}
