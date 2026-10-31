package com.example.shortener.autotests.api;

import com.example.shortener.autotests.model.AuthResponse;
import com.example.shortener.autotests.model.LoginRequest;
import com.example.shortener.autotests.model.RegisterRequest;
import io.qameta.allure.Step;
import io.restassured.http.ContentType;
import io.restassured.response.Response;

import static io.restassured.RestAssured.given;

public class AuthApi {

    @Step("POST /api/auth/register")
    public Response register(RegisterRequest request) {
        return given()
                .contentType(ContentType.JSON)
                .body(request)
                .when()
                .post("/api/auth/register");
    }

    @Step("POST /api/auth/login")
    public Response login(LoginRequest request) {
        return given()
                .contentType(ContentType.JSON)
                .body(request)
                .when()
                .post("/api/auth/login");
    }

    @Step("POST /api/auth/login без тела")
    public Response loginEmptyBody() {
        return given()
                .contentType(ContentType.JSON)
                .body("{}")
                .when()
                .post("/api/auth/login");
    }

    @Step("Логин и извлечение токена")
    public String token(LoginRequest request) {
        AuthResponse response = login(request).then()
                .statusCode(200)
                .extract()
                .as(AuthResponse.class);
        return response.accessToken();
    }
}
