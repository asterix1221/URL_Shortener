package com.example.shortener.common;

public class InvalidUrlException extends BadRequestException {

    public InvalidUrlException(String message) {
        super(message);
    }
}
