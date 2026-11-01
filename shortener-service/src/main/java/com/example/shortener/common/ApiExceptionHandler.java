package com.example.shortener.common;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

/**
 * Глобальный {@code @RestControllerAdvice}: превращает исключения контроллеров в
 * тело {@link ApiError} с подобранным HTTP-статусом.
 *
 * <p>Соответствия: {@link BadRequestException} вместе с наследником
 * {@link InvalidUrlException}, {@link MethodArgumentNotValidException},
 * {@link ConstraintViolationException} и {@link HandlerMethodValidationException}
 * дают 400; {@link InvalidCredentialsException} — 401;
 * {@link ForbiddenException} — 403; {@link NotFoundException} — 404;
 * {@link ConflictException} — 409; {@link GoneException} — 410;
 * {@link RateLimitExceededException} — 429 с заголовком {@code Retry-After}.
 * Любое иное исключение логируется на уровне ERROR и сворачивается в 500 с
 * текстом {@code "Unexpected error"}: исходное сообщение клиенту не показывается.
 *
 * <p>Форма ответа одинакова для всех веток: {@code status} — код состояния,
 * {@code error} — reason phrase этого кода, {@code message} — текст ошибки,
 * {@code path} — {@code request.getRequestURI()}. Отказы фильтрации Spring Security
 * сюда не доходят — там отвечает {@link SecurityErrorWriter}.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    /**
     * Ошибка валидации тела запроса с {@code @Valid}: берётся первое поле в формате
     * {@code имяПоля: сообщение}, если ошибок нет — текст {@code "invalid request"}.
     *
     * @param ex     исключение с результатом биндинга
     * @param request текущий запрос, его путь попадает в {@code path}
     * @return ответ 400 с {@link ApiError}
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> onValidation(MethodArgumentNotValidException ex, HttpServletRequest request) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .findFirst()
                .orElse("invalid request");
        return build(HttpStatus.BAD_REQUEST, message, request);
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ApiError> onBadRequest(BadRequestException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
    }

    /**
     * Нарушение constraint-аннотаций на параметрах метода: первое нарушение в формате
     * {@code propertyPath: сообщение}, при пустом списке — {@code "invalid request"}.
     *
     * @param ex     исключение валидации
     * @param request текущий запрос, его путь попадает в {@code path}
     * @return ответ 400 с {@link ApiError}
     */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiError> onConstraintViolation(ConstraintViolationException ex, HttpServletRequest request) {
        String message = ex.getConstraintViolations().stream()
                .map(violation -> violation.getPropertyPath() + ": " + violation.getMessage())
                .findFirst()
                .orElse("invalid request");
        return build(HttpStatus.BAD_REQUEST, message, request);
    }

    /**
     * Валидация параметров метода контроллера: берётся первое разрешимое сообщение,
     * отсутствие сообщения или списка даёт {@code "invalid request"}.
     *
     * @param ex     исключение валидации метода
     * @param request текущий запрос, его путь попадает в {@code path}
     * @return ответ 400 с {@link ApiError}
     */
    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiError> onHandlerMethodValidation(HandlerMethodValidationException ex,
                                                              HttpServletRequest request) {
        String message = ex.getAllValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream())
                .map(error -> error.getDefaultMessage() == null ? "invalid request" : error.getDefaultMessage())
                .findFirst()
                .orElse("invalid request");
        return build(HttpStatus.BAD_REQUEST, message, request);
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ApiError> onInvalidCredentials(InvalidCredentialsException ex, HttpServletRequest request) {
        return build(HttpStatus.UNAUTHORIZED, ex.getMessage(), request);
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiError> onNotFound(NotFoundException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), request);
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ApiError> onForbidden(ForbiddenException ex, HttpServletRequest request) {
        return build(HttpStatus.FORBIDDEN, ex.getMessage(), request);
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ApiError> onConflict(ConflictException ex, HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, ex.getMessage(), request);
    }

    @ExceptionHandler(GoneException.class)
    public ResponseEntity<ApiError> onGone(GoneException ex, HttpServletRequest request) {
        return build(HttpStatus.GONE, ex.getMessage(), request);
    }

    /**
     * Превышение лимита создания ссылок: единственный обработчик, который добавляет
     * заголовок — {@code Retry-After} в секундах из {@code ex.getRetryAfterSeconds()}.
     *
     * @param ex     исключение с рекомендованной паузой
     * @param request текущий запрос, его путь попадает в {@code path}
     * @return ответ 429 Too Many Requests с {@link ApiError} и {@code Retry-After}
     */
    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<ApiError> onRateLimit(RateLimitExceededException ex, HttpServletRequest request) {
        ApiError body = ApiError.of(HttpStatus.TOO_MANY_REQUESTS.value(),
                HttpStatus.TOO_MANY_REQUESTS.getReasonPhrase(), ex.getMessage(), request.getRequestURI());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.getRetryAfterSeconds()))
                .body(body);
    }

    /**
     * Подстраховка для всех остальных исключений: метод, путь и стектрейс пишутся в
     * лог на уровне ERROR, а клиенту показывается только {@code "Unexpected error"}.
     *
     * @param ex     необработанное исключение
     * @param request текущий запрос, его путь попадает в {@code path}
     * @return ответ 500 с {@link ApiError}
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> onUnexpected(Exception ex, HttpServletRequest request) {
        log.error("unhandled error on {} {}", request.getMethod(), request.getRequestURI(), ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected error", request);
    }

    /**
     * Собирает одинаковый для всех обработчиков ответ: тело {@link ApiError} с
     * reason phrase статуса и URI запроса.
     *
     * @param status  код ответа
     * @param message текст в поле {@code message}
     * @param request текущий запрос
     * @return ответ с этим статусом и телом {@link ApiError}
     */
    private ResponseEntity<ApiError> build(HttpStatus status, String message, HttpServletRequest request) {
        ApiError body = ApiError.of(status.value(), status.getReasonPhrase(), message, request.getRequestURI());
        return ResponseEntity.status(status).body(body);
    }
}
