package com.example.shortener.autotests.tests;

import com.example.shortener.autotests.base.BaseApiTest;
import com.example.shortener.autotests.data.TestData;
import com.example.shortener.autotests.model.CreateLinkRequest;
import com.example.shortener.autotests.model.LinkResponse;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;

@Feature("Создание ссылки")
class LinkCreateTests extends BaseApiTest {

    @Test
    @Tag("smoke")
    @DisplayName("Создание валидной ссылки возвращает 201 и код")
    void createsLink() {
        String token = authenticatedToken();
        CreateLinkRequest request = TestData.linkRequest();
        LinkResponse link = LINKS.create(token, request).then()
                .statusCode(201)
                .body(matchesJsonSchemaInClasspath("schemas/link-response.json"))
                .extract().as(LinkResponse.class);

        assertThat(link.code()).isNotBlank();
        assertThat(link.shortUrl()).endsWith("/" + link.code());
        assertThat(link.originalUrl()).isEqualTo(request.url());
        assertThat(link.active()).isTrue();
    }

    @Test
    @Tag("regression")
    @DisplayName("Создание с собственным alias возвращает этот alias как код")
    void createsLinkWithAlias() {
        String token = authenticatedToken();
        String alias = TestData.uniqueAlias();
        LinkResponse link = LINKS.create(token, TestData.linkRequestWithAlias(alias)).then()
                .statusCode(201)
                .body(matchesJsonSchemaInClasspath("schemas/link-response.json"))
                .extract().as(LinkResponse.class);

        assertThat(link.code()).isEqualTo(alias);
    }

    @Test
    @Tag("regression")
    @DisplayName("Создание с expiresAt сохраняет время жизни в ответе")
    void createsLinkWithExpiry() {
        String token = authenticatedToken();
        CreateLinkRequest request = TestData.linkRequestExpiringInSeconds(3600);
        LinkResponse link = LINKS.create(token, request).then()
                .statusCode(201)
                .body(matchesJsonSchemaInClasspath("schemas/link-response.json"))
                .extract().as(LinkResponse.class);

        assertThat(link.expiresAt()).isBetween(request.expiresAt().minusSeconds(2), request.expiresAt().plusSeconds(2));
    }

    @Test
    @Tag("regression")
    @DisplayName("Создание с maxClicks сохраняет лимит кликов")
    void createsLinkWithMaxClicks() {
        String token = authenticatedToken();
        LinkResponse link = LINKS.create(token, TestData.linkRequestWithMaxClicks(5)).then()
                .statusCode(201)
                .body(matchesJsonSchemaInClasspath("schemas/link-response.json"))
                .extract().as(LinkResponse.class);

        assertThat(link.maxClicks()).isEqualTo(5);
    }

    @Test
    @Tag("regression")
    @DisplayName("Созданная ссылка видна в списке владельца")
    void createdLinkAppearsInOwnerList() {
        String token = authenticatedToken();
        String code = createLinkOk(token, TestData.linkRequest());

        LINKS.list(token, 0, 20).then()
                .statusCode(200)
                .body("content.code", hasItem(code));
    }

    @Test
    @Tag("regression")
    @DisplayName("Ссылка на ftp-протокол отклоняется с 400")
    void rejectsNonHttpScheme() {
        String token = authenticatedToken();
        assertApiError(LINKS.create(token, TestData.linkRequest("ftp://example.com/file")),
                400, "/api/links");
    }

    @Test
    @Tag("regression")
    @DisplayName("Пустой url отклоняется с 400")
    void rejectsBlankUrl() {
        String token = authenticatedToken();
        assertApiError(LINKS.create(token, TestData.linkRequest("   ")), 400, "/api/links");
    }

    @Test
    @Tag("regression")
    @DisplayName("Url длиннее 2048 символов отклоняется с 400")
    void rejectsTooLongUrl() {
        String token = authenticatedToken();
        assertApiError(LINKS.create(token, TestData.linkRequest(TestData.tooLongUrl())), 400, "/api/links");
    }

    @Test
    @Tag("regression")
    @DisplayName("Зарезервированный alias отклоняется с 400")
    void rejectsReservedAlias() {
        String token = authenticatedToken();
        assertApiError(LINKS.create(token, TestData.linkRequestWithAlias("api")), 400, "/api/links");
    }

    @Test
    @Tag("regression")
    @DisplayName("Alias с недопустимыми символами отклоняется с 400")
    void rejectsMalformedAlias() {
        String token = authenticatedToken();
        assertApiError(LINKS.create(token, TestData.linkRequestWithAlias("bad alias!")), 400, "/api/links");
    }

    @Test
    @Tag("regression")
    @DisplayName("Занятый alias отклоняется с 409")
    void rejectsTakenAlias() {
        String token = authenticatedToken();
        String alias = TestData.uniqueAlias();
        LINKS.create(token, TestData.linkRequestWithAlias(alias)).then().statusCode(201);

        assertApiError(LINKS.create(token, TestData.linkRequestWithAlias(alias)), 409, "/api/links");
    }

    @Test
    @Tag("regression")
    @DisplayName("expiresAt в прошлом отклоняется с 400")
    void rejectsPastExpiry() {
        String token = authenticatedToken();
        CreateLinkRequest request = new CreateLinkRequest(TestData.validUrl(), null,
                Instant.now().minusSeconds(60), null);

        assertApiError(LINKS.create(token, request), 400, "/api/links");
    }
}
