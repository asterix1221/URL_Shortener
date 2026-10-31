package com.example.shortener;

import com.example.shortener.auth.dto.AuthResponse;
import com.example.shortener.auth.dto.LoginRequest;
import com.example.shortener.auth.dto.RegisterRequest;
import com.example.shortener.link.dto.LinkResponse;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "app.jwt.secret=integration-tests-secret-value-32-bytes!",
                "app.ip-salt=integration-ip-salt"
        })
abstract class AbstractIT {

    // Один контейнер на JVM: Spring кэширует контекст между IT-классами, поэтому
    // контейнер с жизненным циклом класса (@Container) оставил бы кэш без базы.
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

    static {
        POSTGRES.start();
    }

    private static final AtomicLong UNIQUE = new AtomicLong();

    @Autowired
    protected TestRestTemplate rest;

    @Autowired
    protected JdbcTemplate jdbc;

    @org.springframework.boot.test.web.server.LocalServerPort
    protected int port;

    // java.net.http по умолчанию не следует редиректам, поэтому 302/410 видны как есть
    private final HttpClient client = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NEVER)
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    protected String baseUrl() {
        return "http://localhost:" + port;
    }

    protected String newEmail() {
        return "it-" + UNIQUE.incrementAndGet() + "@example.com";
    }

    protected String registerAndLogin() {
        String email = newEmail();
        RegisterRequest credentials = new RegisterRequest(email, "Passw0rd!");
        rest.postForEntity("/api/auth/register", credentials, Void.class);
        ResponseEntity<AuthResponse> login = rest.postForEntity("/api/auth/login",
                new LoginRequest(email, "Passw0rd!"), AuthResponse.class);
        return login.getBody().accessToken();
    }

    protected HttpHeaders bearer(String token) {
        HttpHeaders headers = jsonHeaders();
        headers.setBearerAuth(token);
        return headers;
    }

    protected HttpHeaders jsonHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    protected LinkResponse createLink(String token, Map<String, Object> body) {
        ResponseEntity<LinkResponse> response = rest.exchange("/api/links", HttpMethod.POST,
                new HttpEntity<>(body, bearer(token)), LinkResponse.class);
        return response.getBody();
    }

    protected HttpResponse<String> click(String code, String referer) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(baseUrl() + "/" + code))
                .GET()
                .header("User-Agent", "integration-test");
        if (referer != null) {
            request.header("Referer", referer);
        }
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    protected Integer clickCount(String code) {
        return jdbc.queryForObject("SELECT click_count FROM links WHERE code = ?", Integer.class, code);
    }

    protected int clickEvents(String code) {
        return jdbc.queryForObject("""
                SELECT count(*) FROM click_events e
                JOIN links l ON l.id = e.link_id
                WHERE l.code = ?
                """, Integer.class, code);
    }
}
