package com.example.shortener.autotests.model;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record LoginRequest(String email, String password) {
}
