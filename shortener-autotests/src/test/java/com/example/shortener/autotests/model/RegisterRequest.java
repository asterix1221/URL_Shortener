package com.example.shortener.autotests.model;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record RegisterRequest(String email, String password) {
}
