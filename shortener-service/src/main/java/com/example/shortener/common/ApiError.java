package com.example.shortener.common;

import java.time.Instant;

/**
 * Единое тело ошибки REST API: момент формирования {@code timestamp}, числовой
 * HTTP-код {@code status}, его reason phrase {@code error}, текст для клиента
 * {@code message} и путь запроса {@code path}.
 *
 * <p>Поля {@code status} и {@code error} не связаны проверкой — вызывающий код
 * передаёт их как есть, обычно из {@code HttpStatus}.
 */
public record ApiError(Instant timestamp, int status, String error, String message, String path) {

    /**
     * Фабрика, которая проставляет {@code timestamp} равным текущему моменту
     * ({@code Instant.now()}); остальные компоненты записываются без нормализации.
     *
     * @param status  числовой HTTP-код ответа
     * @param error   reason phrase этого кода
     * @param message текст ошибки для клиента
     * @param path    URI запроса, на котором возникла ошибка
     * @return новый {@code ApiError} с текущим временем в {@code timestamp}
     */
    public static ApiError of(int status, String error, String message, String path) {
        return new ApiError(Instant.now(), status, error, message, path);
    }
}
