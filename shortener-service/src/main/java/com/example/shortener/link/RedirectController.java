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
