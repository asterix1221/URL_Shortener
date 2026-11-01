package com.example.shortener.auth;

import java.time.Instant;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Service;

/**
 * Выпускает подписанные JWT для входа. Токен кодирует переданный {@link JwtEncoder},
 * алгоритм в заголовке задан жёстко — {@code HS256}, а ключом служит HMAC из того же
 * {@code app.jwt.secret}, что использует декодер из {@code SecurityConfig}. Сервис только
 * создаёт токены: проверку подписи и срока действия выполняет ресурс-сервер Spring
 * Security, механизма отзыва нет.
 */
@Service
public class TokenService {

    private final JwtEncoder encoder;
    private final JwtProperties properties;

    public TokenService(JwtEncoder encoder, JwtProperties properties) {
        this.encoder = encoder;
        this.properties = properties;
    }

    /**
     * Собирает claims и сразу возвращает готовый подписанный токен: {@code sub} — строка из
     * {@code userId} (отдельной проверки на {@code null} нет, поэтому для нулевого
     * идентификатора получится текст {@code "null"}), {@code email} — отдельный claim без
     * нормализации, {@code iat} — текущий момент, {@code exp} — он же плюс
     * {@code app.jwt.ttl-seconds}.
     *
     * @param userId идентификатор пользователя, попадает в {@code sub}
     * @param email адрес пользователя, попадает в claim {@code email}
     * @return подписанный JWT; строка для заголовка запроса — {@code getTokenValue()}
     */
    public Jwt issue(Long userId, String email) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(String.valueOf(userId))
                .claim("email", email)
                .issuedAt(now)
                .expiresAt(now.plusSeconds(properties.ttlSeconds()))
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims));
    }

    public long ttlSeconds() {
        return properties.ttlSeconds();
    }
}
