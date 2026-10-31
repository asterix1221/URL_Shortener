package com.example.shortener.link;

import com.example.shortener.link.dto.CreateLinkRequest;
import com.example.shortener.link.dto.LinkResponse;
import com.example.shortener.link.dto.LinkStatsResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/links")
@Validated
public class LinkController {

    private final LinkService links;

    public LinkController(LinkService links) {
        this.links = links;
    }

    @Operation(summary = "Создать ссылку", responses = {
            @ApiResponse(responseCode = "201", description = "Ссылка создана"),
            @ApiResponse(responseCode = "400", description = "Некорректный url, alias, expiresAt или maxClicks"),
            @ApiResponse(responseCode = "401", description = "Нет токена"),
            @ApiResponse(responseCode = "409", description = "Alias занят")
    })
    @PostMapping
    public ResponseEntity<LinkResponse> create(@AuthenticationPrincipal Jwt jwt,
                                               @Valid @RequestBody CreateLinkRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(links.create(userId(jwt), request));
    }

    @Operation(summary = "Свои ссылки", responses = {
            @ApiResponse(responseCode = "200", description = "Страница ссылок"),
            @ApiResponse(responseCode = "400", description = "size больше 100"),
            @ApiResponse(responseCode = "401", description = "Нет токена")
    })
    @GetMapping
    public Page<LinkResponse> list(@AuthenticationPrincipal Jwt jwt,
                                   @RequestParam(defaultValue = "0") @Min(0) int page,
                                   @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return links.list(userId(jwt), page, size);
    }

    @Operation(summary = "Своя ссылка по коду", responses = {
            @ApiResponse(responseCode = "200", description = "Ссылка найдена"),
            @ApiResponse(responseCode = "401", description = "Нет токена"),
            @ApiResponse(responseCode = "403", description = "Ссылка чужая"),
            @ApiResponse(responseCode = "404", description = "Ссылки нет")
    })
    @GetMapping("/{code}")
    public LinkResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable String code) {
        return links.getOwned(userId(jwt), code);
    }

    @Operation(summary = "Удалить свою ссылку", responses = {
            @ApiResponse(responseCode = "204", description = "Ссылка деактивирована"),
            @ApiResponse(responseCode = "401", description = "Нет токена"),
            @ApiResponse(responseCode = "403", description = "Ссылка чужая"),
            @ApiResponse(responseCode = "404", description = "Ссылки нет")
    })
    @DeleteMapping("/{code}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String code) {
        links.delete(userId(jwt), code);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Статистика кликов по своей ссылке", responses = {
            @ApiResponse(responseCode = "200", description = "Статистика"),
            @ApiResponse(responseCode = "401", description = "Нет токена"),
            @ApiResponse(responseCode = "403", description = "Ссылка чужая"),
            @ApiResponse(responseCode = "404", description = "Ссылки нет")
    })
    @GetMapping("/{code}/stats")
    public LinkStatsResponse stats(@AuthenticationPrincipal Jwt jwt, @PathVariable String code) {
        return links.stats(userId(jwt), code);
    }

    private Long userId(Jwt jwt) {
        return Long.valueOf(jwt.getSubject());
    }
}
