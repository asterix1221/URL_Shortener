package com.example.shortener.autotests.api;

import com.example.shortener.autotests.model.CreateLinkRequest;
import io.qameta.allure.Step;
import io.restassured.http.ContentType;
import io.restassured.http.Header;
import io.restassured.specification.RequestSpecification;
import io.restassured.response.Response;

import static io.restassured.RestAssured.given;

public class LinksApi {

    private static final String AUTHORIZATION = "Authorization";

    @Step("POST /api/links")
    public Response create(String token, CreateLinkRequest request) {
        return authorized(token).body(request).when().post("/api/links");
    }

    @Step("GET /api/links/{code}")
    public Response get(String token, String code) {
        return authorized(token).when().get("/api/links/{code}", code);
    }

    @Step("GET /api/links?page={page}&size={size}")
    public Response list(String token, int page, int size) {
        return authorized(token).when().get("/api/links?page={page}&size={size}", page, size);
    }

    @Step("DELETE /api/links/{code}")
    public Response delete(String token, String code) {
        return authorized(token).when().delete("/api/links/{code}", code);
    }

    @Step("GET /api/links/{code}/stats")
    public Response stats(String token, String code) {
        return authorized(token).when().get("/api/links/{code}/stats", code);
    }

    @Step("GET /{code}")
    public Response redirect(String code) {
        return given().when().get("/{code}", code);
    }

    @Step("GET /{code} с Referer={referrer}")
    public Response redirect(String code, String referrer) {
        return given().header(new Header("Referer", referrer)).when().get("/{code}", code);
    }

    private RequestSpecification authorized(String token) {
        RequestSpecification specification = given().contentType(ContentType.JSON);
        return token == null ? specification : specification.header(AUTHORIZATION, "Bearer " + token);
    }
}
