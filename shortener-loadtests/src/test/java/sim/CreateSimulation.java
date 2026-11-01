package sim;

import static io.gatling.javaapi.core.CoreDsl.global;

import io.gatling.javaapi.core.Simulation;

/**
 * Нагрузка на создание ссылки ({@code POST /api/links}) под одним JWT.
 *
 * <p>Перед прогоном подними {@code RATE_LIMIT_CREATE_PER_MINUTE} в {@code infra/.env} и
 * пересоздай контейнер {@code app}: иначе сценарий упрётся в 429 и будет измерять limiter,
 * а не сервис.
 */
public class CreateSimulation extends Simulation {

    private final String token = Auth.token();

    {
        setUp(Scenarios.create(token).injectOpen(LoadParams.openModel(1.0)))
            .protocols(Scenarios.protocol())
            .assertions(global().failedRequests().percent().lt(1.0));
    }
}
