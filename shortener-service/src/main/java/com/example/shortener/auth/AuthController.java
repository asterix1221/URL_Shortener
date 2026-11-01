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

/**
 * Публичные эндпоинты аутентификации: {@code POST /api/auth/register} и
 * {@code POST /api/auth/login}. В {@code SecurityConfig} путь {@code /api/auth/**} открыт
 * без токена, поэтому оба вызова доступны анонимно. Проверкой тела и разбором ошибок
 * контроллер не занимается: валидацию делает {@code @Valid}, а коды состояния отдаёт
 * {@code ApiExceptionHandler} — {@code 400} на некорректные поля, {@code 409} на занятый
 * email и {@code 401} на неверные учётные данные.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    /**
     * Регистрирует пользователя и не возвращает никаких данных: признак успеха — пустой
     * ответ {@code 201 Created}. Исключение сервиса не преобразуется на месте, оно
     * долетает до {@code ApiExceptionHandler} и становится {@code 409}.
     *
     * @param request email и пароль из тела запроса; ограничения заданы аннотациями
     *                на {@link RegisterRequest}, до входа в метод выполняет {@code @Valid}
     * @return {@code 201 Created} без тела ответа
     * @throws com.example.shortener.common.ConflictException если email уже занят
     */
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

    /**
     * Проверяет email и пароль и отдаёт выданный JWT сразу в теле ответа: обёртки
     * {@code ResponseEntity} нет, поэтому успешный код всегда {@code 200 OK}. Пустые поля
     * отсекает {@code @Valid} ({@code 400}), а неверные данные превращаются обработчиком
     * ошибок в {@code 401} без различия «нет такого пользователя» и «не тот пароль».
     *
     * @param request email и пароль из тела запроса, оба обязательны
     * @return {@link AuthResponse} с токеном доступа и сроком его жизни в секундах
     * @throws com.example.shortener.common.InvalidCredentialsException если пара не подошла
     */
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
