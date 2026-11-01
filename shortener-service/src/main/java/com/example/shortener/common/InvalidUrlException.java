package com.example.shortener.common;

/**
 * Передан URL, который нельзя использовать для сокращения. Отдельного обработчика
 * нет, но как подкласс {@link BadRequestException} попадает в
 * {@link ApiExceptionHandler} и даёт те же 400 Bad Request.
 */
public class InvalidUrlException extends BadRequestException {

    public InvalidUrlException(String message) {
        super(message);
    }
}
