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
import org.awaitility.Awaitility;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;

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

    static final GenericContainer<?> REDIS =
            new GenericContainer<>(DockerImageName.parse("redis:7")).withExposedPorts(6379);

    // 3.9.0 не запускается с конфигом Testcontainers: Kafka тогда считал контроллерский
    // listener адресованным на 0.0.0.0 и падал на валидации advertised.listeners.
    static final KafkaContainer KAFKA =
            new KafkaContainer(DockerImageName.parse("apache/kafka:3.9.1"));

    static {
        POSTGRES.start();
        REDIS.start();
        KAFKA.start();
    }

    // @ServiceConnection для redis/kafka не применяем: Redis здесь GenericContainer,
    // а адреса пробрасываются одним механизмом для всех трёх сервисов.
    @DynamicPropertySource
    static void infrastructure(DynamicPropertyRegistry registry) {
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", REDIS::getFirstMappedPort);
        registry.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
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

    protected int clickEvents(String code) {
        return jdbc.queryForObject("""
                SELECT count(*) FROM click_events e
                JOIN links l ON l.id = e.link_id
                WHERE l.code = ?
                """, Integer.class, code);
    }

    protected Integer clickCount(String code) {
        return jdbc.queryForObject("SELECT click_count FROM links WHERE code = ?", Integer.class, code);
    }

    /** Клики пишутся асинхронно через Kafka, поэтому событие в базе появляется не мгновенно. */
    protected void awaitClickEvents(String code, int expected) {
        Awaitility.await().atMost(Duration.ofSeconds(30))
                .untilAsserted(() -> assertThat(clickEvents(code)).isEqualTo(expected));
    }
}
