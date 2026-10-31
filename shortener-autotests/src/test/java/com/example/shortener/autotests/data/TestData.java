package com.example.shortener.autotests.data;

import com.example.shortener.autotests.model.CreateLinkRequest;
import com.example.shortener.autotests.model.LoginRequest;
import com.example.shortener.autotests.model.RegisterRequest;
import java.time.Instant;
import java.util.UUID;
import net.datafaker.Faker;

public final class TestData {

    /** Datafaker не гарантированно потокобезопасен, а тесты идут конкурентно. */
    private static final ThreadLocal<Faker> FAKER = ThreadLocal.withInitial(Faker::new);

    private TestData() {
    }

    public static String uniqueEmail() {
        return FAKER.get().letterify("??????") + "-" + UUID.randomUUID() + "@autotests.dev";
    }

    public static String password() {
        return FAKER.get().internet().password(10, 16, true, true, true);
    }

    public static String validUrl() {
        return "https://" + FAKER.get().internet().domainName() + "/" + FAKER.get().internet().slug();
    }

    public static String uniqueAlias() {
        return "at" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    public static RegisterRequest registerRequest() {
        return new RegisterRequest(uniqueEmail(), password());
    }

    public static RegisterRequest registerRequest(String email, String password) {
        return new RegisterRequest(email, password);
    }

    public static LoginRequest loginRequest(RegisterRequest credentials) {
        return new LoginRequest(credentials.email(), credentials.password());
    }

    public static CreateLinkRequest linkRequest() {
        return new CreateLinkRequest(validUrl(), null, null, null);
    }

    public static CreateLinkRequest linkRequest(String url) {
        return new CreateLinkRequest(url, null, null, null);
    }

    public static CreateLinkRequest linkRequestWithAlias(String alias) {
        return new CreateLinkRequest(validUrl(), alias, null, null);
    }

    public static CreateLinkRequest linkRequestExpiringInSeconds(long seconds) {
        return new CreateLinkRequest(validUrl(), null, Instant.now().plusSeconds(seconds), null);
    }

    public static CreateLinkRequest linkRequestWithMaxClicks(int maxClicks) {
        return new CreateLinkRequest(validUrl(), null, null, maxClicks);
    }

    public static String tooLongUrl() {
        return "https://example.com/" + "a".repeat(2100);
    }
}
