package sim;

import static io.gatling.javaapi.core.CoreDsl.constantUsersPerSec;
import static io.gatling.javaapi.core.CoreDsl.rampUsersPerSec;

import io.gatling.javaapi.core.OpenInjectionStep;
import java.time.Duration;
import java.util.Locale;

/**
 * Профиль нагрузки и адрес сервиса для всех симуляций.
 *
 * <p>Значения берутся только из переменных окружения: {@code gatling-maven-plugin} запускает
 * симуляцию в отдельной JVM, и {@code -D} до неё доходит не всегда, а переменные окружения
 * наследуются. Пустая переменная считается незаданной и получает значение по умолчанию.
 */
public final class LoadParams {

    /** Адрес входа в сервис — в локальном стенде это gateway, а не порт приложения. */
    public static final String BASE_URL = env("BASE_URL", "http://localhost:8080");

    /** {@code constant}, {@code ramp} или {@code spike}. */
    public static final String PROFILE = env("PROFILE", "constant").toLowerCase(Locale.ROOT);

    /** Целевая интенсивность: базовая для {@code spike}, единственная для {@code constant}. */
    public static final double RPS = Double.parseDouble(env("RPS", "50"));

    /** Начало разгона для {@code ramp}. */
    public static final double RPS_FROM = Double.parseDouble(env("RPS_FROM", "10"));

    /** Конец разгона для {@code ramp}. */
    public static final double RPS_TO = Double.parseDouble(env("RPS_TO", "200"));

    /** Длительность основного участка, секунд. */
    public static final int DURATION_SEC = Integer.parseInt(env("DURATION_SEC", "120"));

    /**
     * Файл-фидер с кодами редиректа. {@code codes.csv} — весь засев из 100 000 ссылок,
     * {@code codes-hot.csv} — выборка в 2000 кодов, которую кэш успевает прогреть: при полном
     * севе случайные коды за две минуты затрагивают малую часть ключей, и сравнение «с кэшем /
     * без кэша» превращается в сравнение двух промахов.
     */
    public static final String CODES_FILE = env("CODES_FILE", "codes.csv");

    /** Длина пика в профиле {@code spike} — фиксирована, чтобы сравнение прогонов было честным. */
    private static final Duration SPIKE_DURATION = Duration.ofSeconds(30);

    private LoadParams() {
    }

    /**
     * Строит последовательность шагов нагрузки для текущего {@code PROFILE}.
     *
     * <p>{@code share} нужен смешанному сценарию: интенсивность каждой популяции умножается на
     * её долю, чтобы суммарная нагрузка осталась равна {@code RPS}. В {@code spike} пик
     * десятикратный и длится фиксированные 30 секунд независимо от доли.
     *
     * @param share доля общей нагрузки, 0..1
     * @return шаги для {@code PopulationBuilder.injectOpen}
     * @throws IllegalArgumentException если {@code PROFILE} не один из трёх ожидаемых
     */
    public static OpenInjectionStep[] openModel(double share) {
        Duration duration = Duration.ofSeconds(DURATION_SEC);
        return switch (PROFILE) {
            case "constant" -> new OpenInjectionStep[] {
                constantUsersPerSec(RPS * share).during(duration)
            };
            case "ramp" -> new OpenInjectionStep[] {
                rampUsersPerSec(RPS_FROM * share).to(RPS_TO * share).during(duration)
            };
            case "spike" -> new OpenInjectionStep[] {
                constantUsersPerSec(RPS * share).during(duration),
                constantUsersPerSec(RPS * share * 10).during(SPIKE_DURATION),
                constantUsersPerSec(RPS * share).during(duration)
            };
            default -> throw new IllegalArgumentException(
                "PROFILE должен быть constant, ramp или spike, получено: " + PROFILE);
        };
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
