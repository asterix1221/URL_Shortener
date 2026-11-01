package sim;

import static io.gatling.javaapi.core.CoreDsl.StringBody;
import static io.gatling.javaapi.core.CoreDsl.csv;
import static io.gatling.javaapi.core.CoreDsl.scenario;
import static io.gatling.javaapi.core.CoreDsl.setInSession;
import static io.gatling.javaapi.http.HttpDsl.http;
import static io.gatling.javaapi.http.HttpDsl.status;

import io.gatling.javaapi.core.ScenarioBuilder;
import io.gatling.javaapi.http.HttpProtocolBuilder;
import java.util.UUID;

/**
 * Определения сценариев, общие для нескольких симуляций.
 *
 * <p>{@code MixedSimulation} обязан считать те же запросы, что и одиночные симуляции, иначе
 * цифры смешанного профиля нельзя сопоставить с baseline. Поэтому сценарии живут здесь, а не
 * внутри каждой симуляции.
 */
public final class Scenarios {

    private Scenarios() {
    }

    /**
     * Редирект по коду из фида {@code CODES_FILE} (по умолчанию {@code codes.csv}) в случайном
     * порядке: так прогон не упирается в один и тот же ключ кэша и не измеряет скорость RAM.
     *
     * <p>Файл выбирается переменной, потому что сравнение кэша требует прогретой выборки: на
     * всём севе в 100 000 кодов случайные попадания в один и тот же ключ за время прогона редки, и
     * вариант «с кэшем» выглядел бы как вариант без кэша (см. {@link LoadParams#CODES_FILE}).
     *
     * <p>Проверка — ровно {@code 302}: протокол настроен без follow-redirect, и 200 означал бы,
     * что сервис отдал страницу сам, а 404 — что код в сиде не совпал с базой.
     */
    public static ScenarioBuilder redirect() {
        return scenario("redirect")
            .feed(csv(LoadParams.CODES_FILE).random())
            .exec(http("GET /{code}")
                .get("/#{code}")
                .check(status().is(302)));
    }

    /**
     * Создание ссылки под выданным токеном.
     *
     * <p>Адрес оригинала уникален на каждую итерацию ({@code UUID} в атрибуте сессии), чтобы
     * прогон не мерил скорость обновления одной и той же строки в базе. Проверка — {@code 201};
     * при исчерпанном лимите создания сервис отвечает {@code 429}, и такой прогон надо
     * не чинить assertion'ом, а поднимать {@code RATE_LIMIT_CREATE_PER_MINUTE}.
     *
     * @param token JWT из {@link Auth#token()}
     */
    public static ScenarioBuilder create(String token) {
        return scenario("create")
            .exec(setInSession(session -> UUID.randomUUID().toString(), "n"))
            .exec(http("POST /api/links")
                .post("/api/links")
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .body(StringBody("{\"url\":\"https://example.com/load/#{n}\"}"))
                .check(status().is(201)));
    }

    /**
     * HTTP-протокол прогонов: keep-alive и общий пул соединений на хост, потому что замеряется
     * сервис, а не рукопожатия TLS/TCP. {@code disableFollowRedirect} обязателен — иначе
     * Gatling пойдёт по {@code Location} на example.com и добавит в замеры чужую сеть.
     */
    public static HttpProtocolBuilder protocol() {
        return http
            .baseUrl(LoadParams.BASE_URL)
            .disableFollowRedirect()
            .shareConnections()
            .maxConnectionsPerHost(500);
    }
}
