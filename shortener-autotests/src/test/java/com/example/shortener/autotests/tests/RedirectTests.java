package com.example.shortener.autotests.tests;

import com.example.shortener.autotests.base.BaseApiTest;
import com.example.shortener.autotests.data.TestData;
import com.example.shortener.autotests.model.CreateLinkRequest;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.awaitility.Awaitility.await;

@Feature("Редирект по короткому коду")
class RedirectTests extends BaseApiTest {

    @Test
    @Tag("smoke")
    @DisplayName("Клик по активной ссылке возвращает 302 и Location на оригинал")
    void redirectsToOriginalUrl() {
        String token = authenticatedToken();
        CreateLinkRequest request = TestData.linkRequest();
        String code = createLinkOk(token, request);

        LINKS.redirect(code).then()
                .statusCode(302)
                .header("Location", request.url());
    }

    @Test
    @Tag("regression")
    @DisplayName("Неизвестный код возвращает 404")
    void unknownCodeReturnsNotFound() {
        String code = TestData.uniqueAlias();
        assertApiError(LINKS.redirect(code), 404, "/" + code);
    }

    @Test
    @Tag("regression")
    @DisplayName("Просроченная ссылка возвращает 410")
    void expiredLinkReturnsGone() {
        String token = authenticatedToken();
        String code = createLinkOk(token, TestData.linkRequestExpiringInSeconds(1));

        LINKS.redirect(code).then().statusCode(302);
        await().atMost(Duration.ofSeconds(20)).pollInterval(Duration.ofSeconds(1))
                .until(() -> LINKS.redirect(code).statusCode() == 410);
    }

    @Test
    @Tag("regression")
    @DisplayName("Удалённая ссылка возвращает 410")
    void deletedLinkReturnsGone() {
        String token = authenticatedToken();
        String code = createLinkOk(token, TestData.linkRequest());

        LINKS.delete(token, code).then().statusCode(204);
        assertApiError(LINKS.redirect(code), 410, "/" + code);
    }

    @Test
    @Tag("regression")
    @DisplayName("После исчерпания maxClicks редирект возвращает 410")
    void exhaustedClickLimitReturnsGone() {
        String token = authenticatedToken();
        String code = createLinkOk(token, TestData.linkRequestWithMaxClicks(1));

        LINKS.redirect(code).then().statusCode(302);
        assertApiError(LINKS.redirect(code), 410, "/" + code);
    }
}
