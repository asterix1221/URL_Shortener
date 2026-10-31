package com.example.shortener.autotests.tests;

import com.example.shortener.autotests.base.BaseApiTest;
import com.example.shortener.autotests.data.TestData;
import com.example.shortener.autotests.model.RegisterRequest;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.emptyString;

import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;

@Feature("Аутентификация")
class AuthTests extends BaseApiTest {

    @Test
    @Tag("smoke")
    @DisplayName("Регистрация нового пользователя возвращает 201")
    void registersNewUser() {
        AUTH.register(TestData.registerRequest()).then().statusCode(201);
    }

    @Test
    @Tag("regression")
    @DisplayName("Пароль короче 8 символов отклоняется с 400")
    void rejectsWeakPassword() {
        RegisterRequest credentials = TestData.registerRequest(TestData.uniqueEmail(), "1234567");
        assertApiError(AUTH.register(credentials), 400, "/api/auth/register");
    }

    @Test
    @Tag("regression")
    @DisplayName("Некорректный email отклоняется с 400")
    void rejectsInvalidEmail() {
        RegisterRequest credentials = TestData.registerRequest("not-an-email", TestData.password());
        assertApiError(AUTH.register(credentials), 400, "/api/auth/register");
    }

    @Test
    @Tag("regression")
    @DisplayName("Повторная регистрация занятого email возвращает 409")
    void rejectsDuplicateEmail() {
        RegisterRequest credentials = TestData.registerRequest();
        AUTH.register(credentials).then().statusCode(201);
        assertApiError(AUTH.register(credentials), 409, "/api/auth/register");
    }

    @Test
    @Tag("smoke")
    @DisplayName("Логин возвращает JWT и срок его жизни")
    void loginReturnsToken() {
        RegisterRequest credentials = newUser();
        AUTH.login(TestData.loginRequest(credentials)).then()
                .statusCode(200)
                .body(matchesJsonSchemaInClasspath("schemas/auth-response.json"))
                .body("expiresIn", greaterThan(0))
                .body("accessToken", not(emptyString()));
    }

    @Test
    @Tag("regression")
    @DisplayName("Логин с неверным паролем возвращает 401")
    void rejectsWrongPassword() {
        RegisterRequest credentials = newUser();
        RegisterRequest wrong = TestData.registerRequest(credentials.email(), credentials.password() + "x");
        assertApiError(AUTH.login(TestData.loginRequest(wrong)), 401, "/api/auth/login");
    }

    @Test
    @Tag("regression")
    @DisplayName("Логин несуществующего пользователя возвращает 401")
    void rejectsUnknownUser() {
        RegisterRequest ghost = TestData.registerRequest();
        assertApiError(AUTH.login(TestData.loginRequest(ghost)), 401, "/api/auth/login");
    }

    @Test
    @Tag("regression")
    @DisplayName("Логин с пустым телом возвращает 400")
    void rejectsEmptyLoginBody() {
        assertApiError(AUTH.loginEmptyBody(), 400, "/api/auth/login");
    }

    @Test
    @Tag("smoke")
    @DisplayName("Защищённый эндпоинт без токена отвечает 401")
    void protectedEndpointNeedsToken() {
        assertApiError(LINKS.create(null, TestData.linkRequest()), 401, "/api/links");
    }
}
