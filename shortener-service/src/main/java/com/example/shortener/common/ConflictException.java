package com.example.shortener.common;

/**
 * Конфликт состояния (например, занятый короткий код или e-mail);
 * {@link ApiExceptionHandler} отдаёт 409 Conflict с текстом сообщения.
 */
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
