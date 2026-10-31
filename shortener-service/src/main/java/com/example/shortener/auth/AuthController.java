package com.example.shortener.auth;

import com.example.shortener.auth.dto.AuthResponse;
import com.example.shortener.auth.dto.LoginRequest;
import com.example.shortener.auth.dto.RegisterRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @Operation(summary = "Зарегистрировать пользователя", responses = {
            @ApiResponse(responseCode = "201", description = "Пользователь создан"),
            @ApiResponse(responseCode = "400", description = "Некорректный email или короткий пароль"),
            @ApiResponse(responseCode = "409", description = "Email уже занят")
    })
    @PostMapping("/register")
    public ResponseEntity<Void> register(@Valid @RequestBody RegisterRequest request) {
        auth.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @Operation(summary = "Войти и получить JWT", responses = {
            @ApiResponse(responseCode = "200", description = "Токен выдан"),
            @ApiResponse(responseCode = "400", description = "Пустое тело"),
            @ApiResponse(responseCode = "401", description = "Неверные данные")
    })
    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return auth.login(request);
    }
}
