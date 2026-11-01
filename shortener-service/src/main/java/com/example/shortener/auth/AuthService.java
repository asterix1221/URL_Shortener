package com.example.shortener.auth;

import com.example.shortener.auth.dto.AuthResponse;
import com.example.shortener.auth.dto.LoginRequest;
import com.example.shortener.auth.dto.RegisterRequest;
import com.example.shortener.common.ConflictException;
import com.example.shortener.common.InvalidCredentialsException;
import com.example.shortener.user.User;
import com.example.shortener.user.UserRepository;
import java.time.Instant;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Регистрация и вход — единственные операции с учётными данными в сервисе. Пароль в
 * открытом виде не хранится и не читается: в базе лежит только хэш от
 * {@link PasswordEncoder}, поэтому смена пароля здесь не предусмотрена. Методы работают с
 * {@link UserRepository} напрямую и не управляют выданными токенами — отзыв отсутствует,
 * проверка JWT идёт только по подписи и сроку, без обращения к базе.
 */
@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokens;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, TokenService tokens) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.tokens = tokens;
    }

    /**
     * Создаёт пользователя в одной транзакции. Email сначала обрезается по краям и только
     * потом ищется без учёта регистра, поэтому {@code Nina@Example.com} и
     * {@code nina@example.com} — один и тот же занятый адрес. Пароль не нормализуется:
     * пробелы по краям остаются частью пароля. Метка времени создания берётся из системных
     * часов, ограничений на длину полей метод не проверяет.
     *
     * @param request email и пароль; при {@code null} email возникает
     *                {@code NullPointerException} в {@code trim()}, валидацию выполняет
     *                вызывающий слой
     * @throws ConflictException если пользователь с таким email уже есть в базе
     */
    @Transactional
    public void register(RegisterRequest request) {
        String email = request.email().trim();
        if (users.findByEmailIgnoreCase(email).isPresent()) {
            throw new ConflictException("email already registered: " + email);
        }
        users.save(new User(email, passwordEncoder.encode(request.password()), Instant.now()));
    }

    /**
     * Проверяет учётные данные и выпускает новый токен. Неизвестный email и неверный
     * пароль дают одно и то же исключение с одинаковым сообщением, чтобы ответ не
     * подсказывал, какая именно часть не совпала. Email сравнивается без учёта регистра
     * после обрезки пробелов; транзакция только для чтения, новых записей метод не создаёт.
     *
     * @param request email и пароль из формы входа; валидацию аннотациями метод не делает
     * @return тело ответа входа: строка JWT и срок его жизни в секундах из конфигурации
     * @throws InvalidCredentialsException если пользователя нет или пароль не совпал
     */
    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        User user = users.findByEmailIgnoreCase(request.email().trim())
                .orElseThrow(() -> new InvalidCredentialsException("invalid email or password"));
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new InvalidCredentialsException("invalid email or password");
        }
        Jwt jwt = tokens.issue(user.getId(), user.getEmail());
        return new AuthResponse(jwt.getTokenValue(), tokens.ttlSeconds());
    }
}
