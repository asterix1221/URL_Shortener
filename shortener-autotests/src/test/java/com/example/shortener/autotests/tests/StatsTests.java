package com.example.shortener.autotests.tests;

import com.example.shortener.autotests.base.BaseApiTest;
import com.example.shortener.autotests.data.TestData;
import com.example.shortener.autotests.model.RegisterRequest;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;

import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;
import static org.awaitility.Awaitility.await;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;

@Feature("Статистика кликов")
class StatsTests extends BaseApiTest {

    private static final String REFERRER = "https://referrer.example.com/campaign";

    @Test
    @Tag("regression")
    @DisplayName("Статистика новой ссылки пуста")
    void statsOfFreshLinkAreEmpty() {
        String token = authenticatedToken();
        String code = createLinkOk(token, TestData.linkRequest());

        LINKS.stats(token, code).then()
                .statusCode(200)
                .body(matchesJsonSchemaInClasspath("schemas/stats-response.json"))
                .body("code", equalTo(code))
                .body("totalClicks", equalTo(0))
                .body("byDay", hasSize(0))
                .body("topReferrers", hasSize(0));
    }

    @Test
    @Tag("smoke")
    @DisplayName("Счётчик кликов растёт после редиректов")
    void clickCounterGrows() {
        String token = authenticatedToken();
        String code = createLinkOk(token, TestData.linkRequest());

        for (int click = 0; click < 3; click++) {
            LINKS.redirect(code).then().statusCode(302);
        }
        await().atMost(Duration.ofSeconds(15))
                .until(() -> LINKS.stats(token, code).jsonPath().getLong("totalClicks") == 3L);

        LINKS.stats(token, code).then()
                .statusCode(200)
                .body(matchesJsonSchemaInClasspath("schemas/stats-response.json"))
                .body("totalClicks", equalTo(3))
                .body("byDay", hasSize(greaterThanOrEqualTo(1)));
    }

    @Test
    @Tag("regression")
    @DisplayName("Referer из клика попадает в topReferrers")
    void referrerIsRecorded() {
        String token = authenticatedToken();
        String code = createLinkOk(token, TestData.linkRequest());

        LINKS.redirect(code, REFERRER).then().statusCode(302);
        await().atMost(Duration.ofSeconds(15)).until(() -> referrersOf(token, code).contains(REFERRER));
    }

    @Test
    @Tag("regression")
    @DisplayName("Статистика чужой ссылки недоступна (403)")
    void statsOfForeignLinkAreForbidden() {
        String ownerToken = authenticatedToken();
        String code = createLinkOk(ownerToken, TestData.linkRequest());
        String strangerToken = authenticatedToken();

        assertApiError(LINKS.stats(strangerToken, code), 403, "/api/links/" + code + "/stats");
    }

    @Test
    @Tag("regression")
    @DisplayName("Статистика без токена отвечает 401")
    void statsWithoutTokenAreUnauthorized() {
        String token = authenticatedToken();
        String code = createLinkOk(token, TestData.linkRequest());

        assertApiError(LINKS.stats(null, code), 401, "/api/links/" + code + "/stats");
    }

    @Test
    @Tag("regression")
    @DisplayName("Удаление своей ссылки отвечает 204 и ссылка исчезает из GET")
    void deleteOwnLinkReturnsNoContent() {
        RegisterRequest owner = newUser();
        String token = tokenFor(owner);
        String code = createLinkOk(token, TestData.linkRequest());

        LINKS.delete(token, code).then().statusCode(204);
        LINKS.get(token, code).then().statusCode(200).body("active", equalTo(false));
    }

    private List<String> referrersOf(String token, String code) {
        return LINKS.stats(token, code).jsonPath().getList("topReferrers.referrer", String.class);
    }
}
