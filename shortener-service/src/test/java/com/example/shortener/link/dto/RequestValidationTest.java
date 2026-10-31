package com.example.shortener.link.dto;

import com.example.shortener.auth.dto.RegisterRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RequestValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void openValidator() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void closeValidator() {
        factory.close();
    }

    @Test
    void acceptsMinimalValidCreateRequest() {
        Set<ConstraintViolation<CreateLinkRequest>> violations = validator.validate(
                new CreateLinkRequest("https://example.com", null, null, null));

        assertThat(violations).isEmpty();
    }

    @Test
    void acceptsUrlOfExactly2048Characters() {
        String url = "https://example.com/" + "a".repeat(2048 - "https://example.com/".length());

        assertThat(url).hasSize(2048);
        assertThat(validator.validate(new CreateLinkRequest(url, null, null, null))).isEmpty();
    }

    @Test
    void rejectsUrlOf2049Characters() {
        String url = "https://example.com/" + "a".repeat(2049 - "https://example.com/".length());

        assertThat(validator.validate(new CreateLinkRequest(url, null, null, null)))
                .singleElement()
                .satisfies(violation -> {
                    assertThat(violation.getPropertyPath()).hasToString("url");
                    assertThat(violation.getMessage()).contains("size");
                });
    }

    @Test
    void rejectsBlankUrl() {
        assertThat(validator.validate(new CreateLinkRequest("  ", null, null, null)))
                .anySatisfy(violation -> assertThat(violation.getPropertyPath()).hasToString("url"));
    }

    @Test
    void rejectsAliasOutOfRange() {
        assertThat(validator.validate(new CreateLinkRequest("https://example.com", "ab", null, null)))
                .singleElement()
                .satisfies(violation -> assertThat(violation.getPropertyPath()).hasToString("alias"));
        assertThat(validator.validate(new CreateLinkRequest("https://example.com", "a".repeat(33), null, null)))
                .singleElement()
                .satisfies(violation -> assertThat(violation.getPropertyPath()).hasToString("alias"));
    }

    @Test
    void rejectsExpirationInThePastAndZeroMaxClicks() {
        assertThat(validator.validate(new CreateLinkRequest("https://example.com", null,
                Instant.now().minus(1, ChronoUnit.MINUTES), null)))
                .singleElement()
                .satisfies(violation -> assertThat(violation.getPropertyPath()).hasToString("expiresAt"));

        assertThat(validator.validate(new CreateLinkRequest("https://example.com", null, null, 0)))
                .singleElement()
                .satisfies(violation -> assertThat(violation.getPropertyPath()).hasToString("maxClicks"));
    }

    @Test
    void acceptsFutureExpirationAndPositiveLimit() {
        CreateLinkRequest request = new CreateLinkRequest("https://example.com", "my-alias",
                Instant.now().plus(1, ChronoUnit.DAYS), 5);

        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    void validatesRegistrationCredentials() {
        assertThat(validator.validate(new RegisterRequest("not-an-email", "Passw0rd!")))
                .singleElement()
                .satisfies(violation -> assertThat(violation.getPropertyPath()).hasToString("email"));

        assertThat(validator.validate(new RegisterRequest("u@example.com", "Passw0d")))
                .singleElement()
                .satisfies(violation -> assertThat(violation.getPropertyPath()).hasToString("password"));

        assertThat(validator.validate(new RegisterRequest("u@example.com", "Passw0rd!"))).isEmpty();
    }
}
