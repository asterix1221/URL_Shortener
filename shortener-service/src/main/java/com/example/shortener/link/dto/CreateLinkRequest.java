package com.example.shortener.link.dto;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;

/**
 * Тело запроса {@code POST /api/links}: адрес-оригинал и необязательные пожелания к коду,
 * сроку жизни и лимиту переходов. Ограничения проверяет Bean Validation в контроллере, а
 * {@code LinkService.create} повторяет смысловые проверки — контракт не должен зависеть от
 * того, откуда пришёл вызов.
 *
 * <p>{@code alias} без значения означает «сгенерировать код из id»; пустая строка этому
 * условию не удовлетворяет, потому что {@code min = 3} требует от трёх символов.
 */
public record CreateLinkRequest(
        @NotBlank @Size(max = 2048) String url,
        @Size(min = 3, max = 32) String alias,
        @Future Instant expiresAt,
        @Min(1) Integer maxClicks
) {
}
