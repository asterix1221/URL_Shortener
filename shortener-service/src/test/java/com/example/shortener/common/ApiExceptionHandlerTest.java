package com.example.shortener.common;

import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.DefaultMessageSourceResolvable;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.validation.method.MethodValidationResult;
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

import static org.assertj.core.api.Assertions.assertThat;

class ApiExceptionHandlerTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void unexpectedErrorBecomes500WithoutInternals() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/links");

        ResponseEntity<ApiError> response = handler.onUnexpected(
                new IllegalStateException("connection pool exhausted for datasource primary"), request);

        // 500 — единственный случай, где текст исключения намеренно не отдаётся клиенту:
        // в нём детали устройства сервиса, а не полезная для API информация
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().message()).isEqualTo("Unexpected error");
        assertThat(response.getBody().message()).doesNotContain("datasource");
        assertThat(response.getBody().status()).isEqualTo(500);
        assertThat(response.getBody().path()).isEqualTo("/api/links");
    }

    @Test
    void badRequestKeepsItsOwnMessage() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/links");

        ResponseEntity<ApiError> response =
                handler.onBadRequest(new BadRequestException("expiresAt: must be in the future"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().message()).isEqualTo("expiresAt: must be in the future");
    }

    @Test
    void handlerMethodValidationPicksFirstErrorMessage() throws Exception {
        Method links = Endpoint.class.getDeclaredMethod("links", int.class, int.class);
        ParameterValidationResult oversize = new ParameterValidationResult(
                new MethodParameter(links, 1), 101, List.of(new DefaultMessageSourceResolvable(
                        new String[] {"Size.max"}, null, "size: must be less than or equal to 100")));
        HandlerMethodValidationException exception = new HandlerMethodValidationException(
                MethodValidationResult.create(new Endpoint(), links, List.of(oversize)));

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/links");
        ResponseEntity<ApiError> response = handler.onHandlerMethodValidation(exception, request);

        // LinkController помечен @Validated, поэтому реальный трафик с невалидным параметром
        // идёт через ConstraintViolationException (его проверяет SecurityIT), а этот обработчик
        // остаётся контрактом на случай, когда @Validated с класса снимут и валидация станет
        // встроенной в Spring MVC. Исключение собирается настоящими частями Spring, потому что
        // публичного конструктора без Method/MethodParameter у него нет.
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().message()).isEqualTo("size: must be less than or equal to 100");
    }

    /** Класс-носитель метода для валидационных метаданных выше. */
    private static class Endpoint {

        void links(int page, int size) {
        }
    }
}
