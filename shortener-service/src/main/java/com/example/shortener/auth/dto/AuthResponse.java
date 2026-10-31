package com.example.shortener.auth.dto;

public record AuthResponse(String accessToken, long expiresIn) {
}
