package com.example.shortener.common;

/**
 * Ссылка больше не доступна (удалена, просрочена или исчерпала лимит кликов);
 * {@link ApiExceptionHandler} отдаёт 410 Gone с текстом сообщения.
 */
public class GoneException extends RuntimeException {

    public GoneException(String message) {
        super(message);
    }
}
