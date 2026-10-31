package com.example.shortener.auth;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.OctetSequenceKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.codec.Base64;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

class TokenServiceTest {

    private static final String SECRET = "unit-test-secret-unit-test-secret-1234";

    private final SecretKey key = new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    private JwtEncoder encoder;
    private JwtDecoder decoder;
    private TokenService tokens;

    @BeforeEach
    void setUp() {
        OctetSequenceKey jwk = new OctetSequenceKey.Builder(key)
                .keyID("shortener-hs256")
                .algorithm(JWSAlgorithm.HS256)
                .build();
        encoder = new NimbusJwtEncoder(new ImmutableJWKSet<>(new com.nimbusds.jose.jwk.JWKSet(jwk)));
        decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        tokens = new TokenService(encoder, new JwtProperties(SECRET, 3600));
    }

    @Test
    void issuesTokenCarryingUserIdAndTtl() {
        Jwt jwt = tokens.issue(7L, "user@example.com");

        Jwt decoded = decoder.decode(jwt.getTokenValue());

        assertThat(decoded.getSubject()).isEqualTo("7");
        assertThat(decoded.getClaimAsString("email")).isEqualTo("user@example.com");
        assertThat(decoded.getExpiresAt()).isBetween(
                Instant.now().plus(3500, ChronoUnit.SECONDS),
                Instant.now().plus(3660, ChronoUnit.SECONDS));
        assertThat(tokens.ttlSeconds()).isEqualTo(3600L);
    }

    @Test
    void rejectsExpiredToken() {
        String expired = encodeWithExpiry(Instant.now().minusSeconds(60));

        assertThatExceptionOfType(JwtException.class)
                .isThrownBy(() -> decoder.decode(expired))
                .withMessageContaining("expired");
    }

    @Test
    void rejectsTokenWithTamperedClaims() {
        Jwt jwt = tokens.issue(7L, "user@example.com");
        String[] parts = jwt.getTokenValue().split("\\.");
        String forgeries = new String(Base64.encode(
                "{\"sub\":\"999\",\"email\":\"attacker@example.com\",\"iat\":1,\"exp\":9999999999}".getBytes(StandardCharsets.UTF_8)),
                StandardCharsets.UTF_8);
        String tampered = parts[0] + "." + forgeries.strip() + "." + parts[2];

        assertThatExceptionOfType(BadJwtException.class).isThrownBy(() -> decoder.decode(tampered));
    }

    @Test
    void rejectsTokenSignedWithAnotherSecret() {
        SecretKey other = new SecretKeySpec(
                "another-secret-another-secret-another-9".getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        JwtEncoder foreignEncoder = new NimbusJwtEncoder(new ImmutableJWKSet<>(new com.nimbusds.jose.jwk.JWKSet(
                new OctetSequenceKey.Builder(other).keyID("other").algorithm(JWSAlgorithm.HS256).build())));
        String foreign = foreignEncoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder().subject("7")
                        .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build()
        )).getTokenValue();

        assertThatExceptionOfType(BadJwtException.class).isThrownBy(() -> decoder.decode(foreign));
    }

    private String encodeWithExpiry(Instant expiresAt) {
        return encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder().subject("7").issuedAt(expiresAt.minusSeconds(10)).expiresAt(expiresAt).build()
        )).getTokenValue();
    }
}
