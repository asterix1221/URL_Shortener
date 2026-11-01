package com.example.shortener.link;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import java.net.URI;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import jakarta.servlet.http.HttpServletRequest;

/**
 * Публичный редирект по короткому коду: {@code GET /{code}} без префикса {@code /api} и без
 * токена — маршрут открыт в {@code SecurityConfig} и принимает весь трафик коротких ссылок.
 *
 * <p>{@code User-Agent} и {@code Referer} необязательны: их отсутствие — обычное явление, а не
 * ошибка, и в {@code click_events} тогда уходит {@code null}. Адрес клиента берётся из запроса,
 * но в базу попадает только его хеш.
 *
 * <p>Ответ — 302, а не 301: ссылка может быть деактивирована или просрочена, а постоянный
 * редирект браузер запомнил бы и перестал обращаться к сервису. Односегментные коды не
 * конфликтуют с маршрутами приложения потому, что {@code LinkService} не отдаёт их под алиасы.
 */
@RestController
public class RedirectController {

    private final LinkService links;

    public RedirectController(LinkService links) {
        this.links = links;
    }

    @Operation(summary = "Редирект по короткому коду", responses = {
            @ApiResponse(responseCode = "302", description = "Перенаправление на оригинал"),
            @ApiResponse(responseCode = "404", description = "Код неизвестен"),
            @ApiResponse(responseCode = "410", description = "Ссылка удалена, просрочена или исчерпан лимит")
    })
    @GetMapping("/{code}")
    public ResponseEntity<Void> redirect(@PathVariable String code,
                                         @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent,
                                         @RequestHeader(value = "Referer", required = false) String referrer,
                                         HttpServletRequest request) {
        String target = links.redirect(code, request.getRemoteAddr(), userAgent, referrer);
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(target)).build();
    }
}
