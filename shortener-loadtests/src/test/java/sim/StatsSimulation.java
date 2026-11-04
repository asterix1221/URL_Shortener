package sim;

import static io.gatling.javaapi.core.CoreDsl.csv;
import static io.gatling.javaapi.core.CoreDsl.global;
import static io.gatling.javaapi.core.CoreDsl.scenario;
import static io.gatling.javaapi.http.HttpDsl.http;
import static io.gatling.javaapi.http.HttpDsl.status;

import io.gatling.javaapi.core.ScenarioBuilder;
import io.gatling.javaapi.core.Simulation;

/**
 * Нагрузка на раздел статистики: {@code GET /api/links/{code}/stats} по кодам, к которым в базе
 * лежит большой массив событий клика.
 *
 * <p>Смысл сценария — измерить стоимость агрегации {@code count(*)} с группировкой по
 * {@code date_trunc('day', clicked_at)} поверх {@code click_events}, поэтому это отдельная
 * симуляция, а не доля смешанного профиля: в {@code MixedSimulation} редиректы забивают собой
 * распределение времени ответа, и деградацию одного запроса в нём не разглядеть.
 *
 * <p>Данные готовит {@code scripts\prepare-stats.ps1}: регистрирует учётку, создаёт 20 ссылок,
 * засевает по ним события клика и пишет {@code token,code} в {@code stats.csv}. Токен живёт один
 * час ({@code app.jwt.ttl-seconds}), поэтому скрипт запускают заново перед каждым замерным окном.
 *
 * <p>Код выбирается {@code random()}: последовательный обход доставал бы одну и ту же ссылку
 * подряд несколько раз, и прогон измерял бы прогретость буферов Postgres, а не стоимость
 * агрегации по разным ключам.
 */
public class StatsSimulation extends Simulation {

    /** Доля брака, при которой прогон считается годным — как в остальных симуляциях. */
    private static final double MAX_FAILED_PERCENT = 1.0;

    private final ScenarioBuilder stats = scenario("stats")
        .feed(csv("stats.csv").random())
        .exec(http("GET /api/links/{code}/stats")
            .get("/api/links/#{code}/stats")
            .header("Authorization", "Bearer #{token}")
            .check(status().is(200)));

    {
        setUp(stats.injectOpen(LoadParams.openModel(1.0)))
            .protocols(Scenarios.protocol())
            .assertions(global().failedRequests().percent().lt(MAX_FAILED_PERCENT));
    }
}
