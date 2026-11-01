package sim;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Получение JWT до старта прогона.
 *
 * <p>Регистрация и вход делаются обычным {@code java.net.http}, а не сценарием Gatling: токен
 * нужен в конструкторе симуляции, чтобы подставить его в заголовок каждого запроса, а
 * «настроечный» сценарий в отчёте загрязнял бы статистику по бизнес-запросам.
 *
 * <p>Учётка одна на весь прогон и постоянна между прогонами: повторная регистрация отвечает
 * {@code 409}, и это не ошибка, а признак того, что пользователь уже есть — вход работает и
 * с ним. Лимит на создание ссылок при этом общий на аккаунт, поэтому для {@code CreateSimulation}
 * лимит в {@code infra/.env} поднимают (см. п. 6.5 плана).
 */
public final class Auth {

    private static final String EMAIL = "load-runner@example.com";
    private static final String PASSWORD = "load-test-secret";

    private Auth() {
    }

    /**
     * Регистрирует нагрузочную учётку (если её ещё нет) и возвращает выданный токен.
     *
     * @return {@code accessToken} из ответа {@code POST /api/auth/login}
     * @throws IllegalStateException если вход не удался или в ответе нет поля токена, либо если
     *         сервис недоступен (IO-ошибка транспорта оборачивается в ту же причину)
     */
    public static String token() {
        String credentials = "{\"email\":\"" + EMAIL + "\",\"password\":\"" + PASSWORD + "\"}";
        try (HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build()) {
            post(client, "/api/auth/register", credentials);
            HttpResponse<String> login =
                post(client, "/api/auth/login", credentials);
            if (login.statusCode() != 200) {
                throw new IllegalStateException(
                    "Не удалось войти в " + LoadParams.BASE_URL + ": " + login.statusCode()
                        + " " + login.body());
            }
            String token = extract(login.body(), "accessToken");
            if (token == null) {
                throw new IllegalStateException("В ответе логина нет поля accessToken: " + login.body());
            }
            return token;
        }
    }

    private static HttpResponse<String> post(HttpClient client, String path, String body) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(LoadParams.BASE_URL + path))
            .timeout(Duration.ofSeconds(15))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
        try {
            return client.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException ex) {
            throw new IllegalStateException("Запрос " + path + " не дошёл до сервиса", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Регистрация нагрузочного пользователя прервана", ex);
        }
    }

    /**
     * Вытаскивает строковое поле из JSON-ответа. Ответ логина плоский, поэтому тащить
     * JSON-библиотеку в тестовый модуль ради одного поля не нужно.
     */
    private static String extract(String json, String field) {
        String marker = "\"" + field + "\":\"";
        int from = json.indexOf(marker);
        if (from < 0) {
            return null;
        }
        int start = from + marker.length();
        int end = json.indexOf('"', start);
        return end < 0 ? null : json.substring(start, end);
    }
}
