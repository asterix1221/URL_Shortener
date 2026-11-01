package com.example.shortener.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Формат ошибок, которые Security отдаёт сама (без входа в контроллер): тот же JSON, что и
 * {@link ApiExceptionHandler}, чтобы клиент не различал «не авторизован» и «валидация».
 */
class SecurityErrorWriterTest {

    // тот же mapper, что создаёт Spring Boot: Instant в ApiError сериализуется ISO-строкой,
    // иначе writeValueAsString падает ещё до ответа клиенту
    private final SecurityErrorWriter writer = new SecurityErrorWriter(
            new ObjectMapper().registerModule(new JavaTimeModule())
                    .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS));

    @Test
    void missingTokenIsJson401() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/links");
        MockHttpServletResponse response = new MockHttpServletResponse();

        writer.commence(request, response, new InsufficientAuthenticationException("no token"));

        assertThat(response.getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.getContentType()).startsWith("application/json");
        assertThat(response.getContentAsString())
                .contains("\"status\":401")
                .contains("authentication required")
                .contains("/api/links");
    }

    @Test
    void deniedAccessIsJson403() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("DELETE", "/api/links/abc123");
        MockHttpServletResponse response = new MockHttpServletResponse();

        // Ни одно правило SecurityConfig пока не требует роли, поэтому в HTTP этот путь не
        // возникает; проверка фиксирует ответ, который получит любое будущее rule-based
        // ограничение (в том числе /actuator, если его закрыть).
        writer.handle(request, response, new AccessDeniedException("admin only"));

        assertThat(response.getStatus()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(response.getContentAsString())
                .contains("\"status\":403")
                .contains("access denied")
                .contains("/api/links/abc123");
    }

    @Test
    void errorBodyCarriesPathOfOriginalRequest() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
        MockHttpServletResponse response = new MockHttpServletResponse();

        writer.commence(request, response, new UsernameNotFoundException("bad user"));

        assertThat(response.getContentAsString()).contains("\"path\":\"/api/auth/login\"");
        // тело ошибки не раскрывает стек-трейс и не добавляет лишних полей
        assertThat(response.getContentAsString()).doesNotContain("stackTrace");
    }
}
