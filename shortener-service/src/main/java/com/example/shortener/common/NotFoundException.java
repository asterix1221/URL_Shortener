package com.example.shortener.common;

/**
 * Ресурс не найден; {@link ApiExceptionHandler} отдаёт 404 Not Found с текстом
 * сообщения.
 */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }
}
