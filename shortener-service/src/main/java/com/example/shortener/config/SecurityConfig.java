package com.example.shortener.config;

import com.example.shortener.auth.JwtProperties;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.OctetSequenceKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import com.example.shortener.common.SecurityErrorWriter;

/**
 * Включает Spring Security ({@code @EnableWebSecurity}) и описывает цепочку
 * фильтров HTTP, а также криптографические бины для JWT и паролей.
 *
 * <p>Открыты без токена: GET /{code} (публичный редирект по короткому коду),
 * {@code /api/auth/**}, {@code /actuator/health}, {@code /actuator/prometheus},
 * {@code /swagger-ui/**} и {@code /v3/api-docs/**}. Требует аутентификации только
 * {@code /api/**}; всё остальное снова разрешено анонимно
 * ({@code anyRequest().permitAll()}). CSRF выключен, сессии не создаются
 * ({@code STATELESS}), токен передаётся как Bearer.
 *
 * <p>Отказ фильтрации отдаёт не страницу Spring, а JSON {@code ApiError}: один и тот
 * же {@link SecurityErrorWriter} подключён как {@code authenticationEntryPoint}
 * ресурс-сервера (иначе на испорченный JWT отвечал бы пустой 401), как точка входа
 * {@code exceptionHandling} и как {@code accessDeniedHandler}.
 *
 * <p>Подпись токенов — HMAC-SHA256. Секрет читается из {@code app.jwt.secret}
 * (свойства регистрируются {@code @EnableConfigurationProperties} для
 * {@link JwtProperties}; пустой или короче 32 байт секрет валит старт приложения),
 * {@code app.jwt.ttl-seconds} этим классом не используется.
 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(JwtProperties.class)
public class SecurityConfig {

    /**
     * Используется при регистрации и входе: пароли хранятся как BCrypt-хэши, поэтому
     * проверка сравнивает пароль с хэшем через {@code matches}.
     *
     * @return новый {@code BCryptPasswordEncoder}
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Общий секрет для подписи и проверки JWT, байты строки {@code app.jwt.secret}
     * в UTF-8 без дополнительного хеширования.
     *
     * @param properties настроенные значения {@code app.jwt.*}
     * @return ключ для алгоритма {@code HmacSHA256}
     */
    @Bean
    public SecretKey jwtSecretKey(JwtProperties properties) {
        byte[] secret = properties.secret().getBytes(StandardCharsets.UTF_8);
        return new SecretKeySpec(secret, "HmacSHA256");
    }

    /**
     * Энкодер для выдачи токенов: тот же секрет, но оформленный как JWK с kid
     * {@code "shortener-hs256"} и алгоритмом HS256.
     *
     * @param secretKey бин {@link #jwtSecretKey(JwtProperties)}
     * @return {@code NimbusJwtEncoder} на неизменяемом наборе из одного ключа
     */
    @Bean
    public JwtEncoder jwtEncoder(SecretKey secretKey) {
        OctetSequenceKey jwk = new OctetSequenceKey.Builder(secretKey)
                .keyID("shortener-hs256")
                .algorithm(JWSAlgorithm.HS256)
                .build();
        JWKSource<SecurityContext> jwkSource = new ImmutableJWKSet<>(new com.nimbusds.jose.jwk.JWKSet(jwk));
        return new NimbusJwtEncoder(jwkSource);
    }

    /**
     * Дешифратор для ресурс-сервера: принимает только подпись HS256 тем же секретом,
     * что выдал {@link #jwtEncoder(SecretKey)}.
     *
     * @param secretKey бин {@link #jwtSecretKey(JwtProperties)}
     * @return {@code NimbusJwtDecoder} на симметричном ключе
     */
    @Bean
    public JwtDecoder jwtDecoder(SecretKey secretKey) {
        return NimbusJwtDecoder.withSecretKey(secretKey).macAlgorithm(MacAlgorithm.HS256).build();
    }

    /**
     * Цепочка фильтров: Stateless + Bearer-JWT вместо cookie-сессий. Ролей и
     * authority здесь нет — {@code /api/**} доступен любому, чей токен прошёл
     * проверку, а принадлежность ресурса пользователю контролирует сервисный слой.
     * Матчеры применяются в порядке объявления, поэтому публичный редирект
     * GET /{code} стоит первым.
     *
     * @param http        строитель цепочки от Spring Security
     * @param jwtDecoder  бин {@link #jwtDecoder(SecretKey)} для ресурс-сервера
     * @param errorWriter единый JSON-ответ 401/403 вместо страниц Spring
     * @return собранная {@code SecurityFilterChain}
     * @throws Exception если конфигурация фильтров не применима
     */
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, JwtDecoder jwtDecoder,
                                           SecurityErrorWriter errorWriter) throws Exception {
        return http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(registry -> registry
                        .requestMatchers(HttpMethod.GET, "/{code}").permitAll()
                        .requestMatchers("/api/auth/**").permitAll()
                        .requestMatchers("/actuator/health").permitAll()
                        // осознанно для учебного проекта: снимать метрики без токена проще,
                        // в проде здесь был бы отдельный management-порт с аутентификацией
                        .requestMatchers("/actuator/prometheus").permitAll()
                        .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .jwt(jwt -> jwt.decoder(jwtDecoder))
                        // без этого ресурс-сервер отвечает пустым 401 на испорченный токен
                        .authenticationEntryPoint(errorWriter))
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(errorWriter)
                        .accessDeniedHandler(errorWriter))
                .build();
    }
}
