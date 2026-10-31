package com.example.shortener;

import com.example.shortener.link.dto.LinkResponse;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;

import static org.assertj.core.api.Assertions.assertThat;

class SecurityIT extends AbstractIT {

    @Autowired
    private JwtEncoder encoder;

    @Test
    void anonymousCallsAreRejectedWithUnifiedErrorBody() {
        ResponseEntity<Map> noToken = rest.exchange("/api/links", HttpMethod.GET,
                new HttpEntity<>(jsonHeaders()), Map.class);

        assertThat(noToken.getStatusCode().value()).isEqualTo(401);
        assertErrorBody(noToken.getBody(), 401, "Unauthorized");
    }

    @Test
    void malformedAndForeignTokensAreRejected() {
        ResponseEntity<Map> garbage = rest.exchange("/api/links", HttpMethod.GET,
                new HttpEntity<>(bearer("not-a-jwt")), Map.class);
        assertThat(garbage.getStatusCode().value()).isEqualTo(401);
        assertErrorBody(garbage.getBody(), 401, "Unauthorized");

        String expired = tokenWithExpiry(Instant.now().minusSeconds(60));
        ResponseEntity<Map> stale = rest.exchange("/api/links", HttpMethod.GET,
                new HttpEntity<>(bearer(expired)), Map.class);
        assertThat(stale.getStatusCode().value()).isEqualTo(401);

        String corrupted = tokenWithExpiry(Instant.now().plusSeconds(3600));
        String tampered = corrupted.substring(0, corrupted.lastIndexOf('.') + 1) + "AAAA";
        ResponseEntity<Map> forged = rest.exchange("/api/links", HttpMethod.GET,
                new HttpEntity<>(bearer(tampered)), Map.class);
        assertThat(forged.getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void foreignLinkIsHiddenFromOtherUsers() throws Exception {
        String owner = registerAndLogin();
        String intruder = registerAndLogin();
        LinkResponse link = createLink(owner, Map.of("url", "https://example.com/private"));

        assertThat(rest.exchange("/api/links/" + link.code(), HttpMethod.GET,
                new HttpEntity<>(bearer(intruder)), Map.class).getStatusCode().value()).isEqualTo(403);
        assertThat(rest.exchange("/api/links/" + link.code() + "/stats", HttpMethod.GET,
                new HttpEntity<>(bearer(intruder)), Map.class).getStatusCode().value()).isEqualTo(403);
        assertThat(rest.exchange("/api/links/" + link.code(), HttpMethod.DELETE,
                new HttpEntity<>(bearer(intruder)), Map.class).getStatusCode().value()).isEqualTo(403);

        // публичный редирект при этом продолжает работать
        assertThat(click(link.code(), null).statusCode()).isEqualTo(302);
        assertThat(rest.exchange("/api/links/" + link.code(), HttpMethod.GET,
                new HttpEntity<>(bearer(owner)), Map.class).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void unknownCodeAndOutOfRangePageReturnJsonErrors() throws Exception {
        HttpResponse<String> missing = click("zzzzzzzz", null);
        assertThat(missing.statusCode()).isEqualTo(404);
        assertThat(missing.body()).contains("\"status\":404").contains("\"path\":\"/zzzzzzzz\"");

        String token = registerAndLogin();
        ResponseEntity<Map> tooLarge = rest.exchange("/api/links?page=0&size=101", HttpMethod.GET,
                new HttpEntity<>(bearer(token)), Map.class);
        assertThat(tooLarge.getStatusCode().value()).isEqualTo(400);
        assertErrorBody(tooLarge.getBody(), 400, "Bad Request");
    }

    @Test
    void registrationIsValidated() {
        ResponseEntity<Map> badEmail = rest.postForEntity("/api/auth/register",
                new HttpEntity<>(Map.of("email", "nope", "password", "Passw0rd!"),
                        jsonHeaders()), Map.class);
        assertThat(badEmail.getStatusCode().value()).isEqualTo(400);
        assertThat(String.valueOf(badEmail.getBody().get("message"))).startsWith("email:");

        String email = newEmail();
        rest.postForEntity("/api/auth/register",
                new HttpEntity<>(Map.of("email", email, "password", "Passw0rd!"),
                        jsonHeaders()), Map.class);
        ResponseEntity<Map> duplicate = rest.postForEntity("/api/auth/register",
                new HttpEntity<>(Map.of("email", email.toUpperCase(), "password", "Passw0rd!"),
                        jsonHeaders()), Map.class);
        assertThat(duplicate.getStatusCode().value()).isEqualTo(409);

        ResponseEntity<Map> wrongPassword = rest.postForEntity("/api/auth/login",
                new HttpEntity<>(Map.of("email", email, "password", "WrongPass123"),
                        jsonHeaders()), Map.class);
        assertThat(wrongPassword.getStatusCode().value()).isEqualTo(401);
    }

    private String tokenWithExpiry(Instant expiresAt) {
        return encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder()
                        .subject("1")
                        .issuedAt(expiresAt.minusSeconds(3600))
                        .expiresAt(expiresAt)
                        .build())).getTokenValue();
    }

    private void assertErrorBody(Map body, int status, String error) {
        assertThat(body).isNotNull();
        assertThat(body).containsEntry("status", status)
                .containsEntry("error", error)
                .containsKey("timestamp")
                .containsKey("path");
        assertThat(String.valueOf(body.get("message"))).doesNotContain("at java.");
    }
}
