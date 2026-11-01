package com.example.shortener.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

/**
 * Пишет ответы об ошибках Spring Security в той же JSON-форме {@link ApiError}, что
 * и {@link ApiExceptionHandler}.
 *
 * <p>Spring требует этот класс: отказы фильтрации (нет токена, токен не прошёл
 * проверку, маршрут запрещён) происходят до диспетчера MVC, поэтому аннотированные
 * обработчики контроллеров их не видят. Без этого класса клиент получил бы пустой
 * 401/403.
 *
 * <p>Бин зарегистрирован в {@code SecurityConfig} и как точка входа
 * {@code oauth2ResourceServer}, и в {@code exceptionHandling}; тело всегда один
 * и тот же шаблон: статус, его reason phrase, фиксированный текст и URI запроса.
 */
@Component
public class SecurityErrorWriter implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final ObjectMapper mapper;

    public SecurityErrorWriter(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * Отвечает 401 с сообщением {@code "authentication required"} — запрос
     * потребовал аутентификацию, которая не удалась (токен отсутствует или
     * не прошёл проверку подписи).
     *
     * @param request      запрос, путь которого попадает в {@code path}
     * @param response     ответ, в который пишется JSON
     * @param authException причина отказа в аутентификации, в тело не попадает
     * @throws IOException если не удалось записать тело ответа в поток
     */
    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        write(request, response, HttpStatus.UNAUTHORIZED, "authentication required");
    }

    /**
     * Отвечает 403 с сообщением {@code "access denied"} — пользователь
     * аутентифицирован, но маршрут ему закрыт.
     *
     * @param request               запрос, путь которого попадает в {@code path}
     * @param response              ответ, в который пишется JSON
     * @param accessDeniedException причина отказа в доступе, в тело не попадает
     * @throws IOException если не удалось записать тело ответа в поток
     */
    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       org.springframework.security.access.AccessDeniedException accessDeniedException)
            throws IOException {
        write(request, response, HttpStatus.FORBIDDEN, "access denied");
    }

    /**
     * Общая запись ответа: выставляет статус, {@code application/json} с UTF-8 и
     * сериализует {@link ApiError} в поток ответа.
     *
     * @param request запрос, путь которого используется как {@code path}
     * @param response целевой ответ
     * @param status  код состояния (401 или 403)
     * @param message фиксированный текст ошибки
     * @throws IOException если сериализация или запись в поток не удались
     */
    private void write(HttpServletRequest request, HttpServletResponse response,
                       HttpStatus status, String message) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        ApiError error = ApiError.of(status.value(), status.getReasonPhrase(), message, request.getRequestURI());
        mapper.writeValue(response.getOutputStream(), error);
    }
}
