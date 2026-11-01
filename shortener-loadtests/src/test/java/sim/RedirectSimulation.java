package sim;

import static io.gatling.javaapi.core.CoreDsl.global;

import io.gatling.javaapi.core.Simulation;

/**
 * Нагрузка только на редирект: читает коды из {@code codes.csv} (см. {@code scripts/seed.sql}).
 *
 * <p>Запуск: {@code .\mvnw.cmd gatling:test "-Dgatling.simulationClass=sim.RedirectSimulation"}
 * с выставленными {@code BASE_URL}, {@code PROFILE}, {@code RPS}, {@code DURATION_SEC} —
 * удобнее через {@code scripts\run-load.ps1}.
 */
public class RedirectSimulation extends Simulation {

    /**
     * Доля брака, при которой прогон считается годным: проверка одна на весь прогон и
     * отсекает массовые отказы, не споря с единичными таймаутами генератора.
     */
    private static final double MAX_FAILED_PERCENT = 1.0;

    {
        setUp(Scenarios.redirect().injectOpen(LoadParams.openModel(1.0)))
            .protocols(Scenarios.protocol())
            .assertions(global().failedRequests().percent().lt(MAX_FAILED_PERCENT));
    }
}
