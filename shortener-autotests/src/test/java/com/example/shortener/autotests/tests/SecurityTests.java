package com.example.shortener.autotests.tests;

import com.example.shortener.autotests.base.BaseApiTest;
import com.example.shortener.autotests.data.TestData;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.equalTo;

@Feature("Контроль доступа")
class SecurityTests extends BaseApiTest {

    @Test
    @Tag("regression")
    @DisplayName("Испорченный токен отвергается с 401")
    void tamperedTokenIsRejected() {
        String code = TestData.uniqueAlias();
        assertApiError(LINKS.get("aaa.bbb.ccc", code), 401, "/api/links/" + code);
    }

    @Test
    @Tag("regression")
    @DisplayName("Список ссылок без токена отвечает 401")
    void listWithoutTokenIsUnauthorized() {
        assertApiError(LINKS.list(null, 0, 20), 401, "/api/links");
    }

    @Test
    @Tag("regression")
    @DisplayName("Чужую ссылку получить нельзя (403)")
    void foreignLinkIsNotReadable() {
        String ownerToken = authenticatedToken();
        String code = createLinkOk(ownerToken, TestData.linkRequest());
        String strangerToken = authenticatedToken();

        assertApiError(LINKS.get(strangerToken, code), 403, "/api/links/" + code);
    }

    @Test
    @Tag("regression")
    @DisplayName("Чужую ссылку удалить нельзя (403)")
    void foreignLinkIsNotDeletable() {
        String ownerToken = authenticatedToken();
        String code = createLinkOk(ownerToken, TestData.linkRequest());
        String strangerToken = authenticatedToken();

        assertApiError(LINKS.delete(strangerToken, code), 403, "/api/links/" + code);
        LINKS.get(ownerToken, code).then().statusCode(200).body("active", equalTo(true));
    }

    @Test
    @Tag("regression")
    @DisplayName("Запрос несуществующей ссылки отвечает 404")
    void missingLinkIsNotFound() {
        String token = authenticatedToken();
        String code = TestData.uniqueAlias();

        assertApiError(LINKS.get(token, code), 404, "/api/links/" + code);
    }

    @Test
    @Tag("regression")
    @DisplayName("Страница списка больше 100 элементов отклоняется с 400")
    void oversizedPageIsRejected() {
        String token = authenticatedToken();
        assertApiError(LINKS.list(token, 0, 101), 400, "/api/links");
    }
}
