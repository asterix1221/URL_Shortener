package com.example.shortener.autotests.base;

import com.example.shortener.autotests.api.AuthApi;
import com.example.shortener.autotests.api.LinksApi;
import com.example.shortener.autotests.data.TestData;
import com.example.shortener.autotests.model.CreateLinkRequest;
import com.example.shortener.autotests.model.LinkResponse;
import com.example.shortener.autotests.model.RegisterRequest;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import io.qameta.allure.Epic;
import io.qameta.allure.restassured.AllureRestAssured;
import io.restassured.RestAssured;
import io.restassured.config.ObjectMapperConfig;
import io.restassured.config.RedirectConfig;
import io.restassured.config.RestAssuredConfig;
import io.restassured.response.Response;

import java.util.Map;

import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;
import static org.hamcrest.Matchers.emptyOrNullString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.not;

@Epic("URL Shortener API")
public abstract class BaseApiTest {

    protected static final AuthApi AUTH = new AuthApi();
    protected static final LinksApi LINKS = new LinksApi();

    private static final Map<Integer, String> REASONS = Map.of(
            400, "Bad Request",
            401, "Unauthorized",
            403, "Forbidden",
            404, "Not Found",
            409, "Conflict",
            410, "Gone",
            500, "Internal Server Error");

    static {
        RestAssured.baseURI = System.getProperty("baseUrl", "http://localhost:8080");
        RestAssured.config = RestAssuredConfig.config()
                .objectMapperConfig(new ObjectMapperConfig()
                        .jackson2ObjectMapperFactory((type, charset) -> mapper()))
                // редиректы не разворачиваем: проверяем сам ответ 302/410
                .redirect(RedirectConfig.redirectConfig().followRedirects(false));
        RestAssured.filters(new AllureRestAssured());
        RestAssured.enableLoggingOfRequestAndResponseIfValidationFails();
    }

    private static ObjectMapper mapper() {
        return new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .setSerializationInclusion(JsonInclude.Include.NON_NULL);
    }

    /** Свой пользователь для каждого теста: уникальные данные и независимость тестов друг от друга. */
    protected RegisterRequest newUser() {
        RegisterRequest credentials = TestData.registerRequest();
        AUTH.register(credentials).then().statusCode(201);
        return credentials;
    }

    protected String tokenFor(RegisterRequest credentials) {
        return AUTH.token(TestData.loginRequest(credentials));
    }

    protected String authenticatedToken() {
        return tokenFor(newUser());
    }

    /** Позитивное создание ссылки: код нужен почти каждому тесту, сам контракт проверяет LinkCreateTests. */
    protected String createLinkOk(String token, CreateLinkRequest request) {
        return LINKS.create(token, request).then().statusCode(201).extract().as(LinkResponse.class).code();
    }

    protected static void assertApiError(Response response, int status, String path) {
        response.then()
                .statusCode(status)
                .body(matchesJsonSchemaInClasspath("schemas/error-response.json"))
                .body("status", equalTo(status))
                .body("error", equalTo(REASONS.get(status)))
                .body("message", not(emptyOrNullString()))
                .body("path", equalTo(path));
    }
}
