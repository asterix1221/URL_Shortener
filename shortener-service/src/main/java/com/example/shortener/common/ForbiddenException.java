package com.example.shortener.common;

/**
 * Действие запрещено конкретному пользователю (например, доступ к чужой ссылке);
 * {@link ApiExceptionHandler} отдаёт 403 Forbidden с текстом сообщения.
 */
public class ForbiddenException extends RuntimeException {

    public ForbiddenException(String message) {
        super(message);
    }
}
