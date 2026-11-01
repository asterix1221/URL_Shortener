package com.example.shortener.common;

/**
 * Некорректный запрос; {@link ApiExceptionHandler} отвечает на него 400 Bad Request,
 * а текст сообщения кладёт в поле {@code message} тела {@link ApiError}.
 */
public class BadRequestException extends RuntimeException {

    public BadRequestException(String message) {
        super(message);
    }
}
