package sim;

import static io.gatling.javaapi.core.CoreDsl.global;

import io.gatling.javaapi.core.Simulation;

/**
 * Смешанная нагрузка: 95% редиректов и 5% созданий ссылок.
 *
 * <p>Доли реализованы двумя популяциями с пропорциональной интенсивностью, а не выбором
 * сценария внутри одного пользователя: суммарный {@code RPS} при этом остаётся заданным,
 * и его можно сравнить с одиночными симуляциями.
 */
public class MixedSimulation extends Simulation {

    private static final double REDIRECT_SHARE = 0.95;

    private final String token = Auth.token();

    {
        setUp(
            Scenarios.redirect().injectOpen(LoadParams.openModel(REDIRECT_SHARE)),
            Scenarios.create(token).injectOpen(LoadParams.openModel(1 - REDIRECT_SHARE))
        )
            .protocols(Scenarios.protocol())
            .assertions(global().failedRequests().percent().lt(1.0));
    }
}
