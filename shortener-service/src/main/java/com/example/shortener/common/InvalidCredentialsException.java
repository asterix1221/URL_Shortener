package com.example.shortener.common;

/**
 * Неверный e-mail или пароль при входе; {@link ApiExceptionHandler} отдаёт
 * 401 Unauthorized с текстом сообщения.
 */
public class InvalidCredentialsException extends RuntimeException {

    public InvalidCredentialsException(String message) {
        super(message);
    }
}
