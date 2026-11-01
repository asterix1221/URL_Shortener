package com.example.shortener.link.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Сводка переходов по одной ссылке. Считается по таблице {@code click_events}, куда события
 * пишет консьюмер из Kafka, поэтому самые свежие редиректы в числах ещё могут отсутствовать.
 *
 * <p>{@code byDay} отсортирован по дате возрастанию, {@code topReferrers} — не больше десяти
 * значений по убыванию числа кликов. {@code totalClicks} считает все события ссылки, поэтому
 * сумма по {@code topReferrers} может быть меньше: срезаны источники после десятого места.
 */
public record LinkStatsResponse(String code, long totalClicks, List<DailyClicks> byDay,
                                 List<ReferrerClicks> topReferrers) {

    /** Клики за один календарный день; день считается в UTC, как и {@code clicked_at}. */
    public record DailyClicks(LocalDate date, long count) {
    }

    /**
     * Клики из одного источника. Пустой {@code referrer} — это переходы без заголовка
     * {@code Referer}, собранные в одну группу через {@code COALESCE}.
     */
    public record ReferrerClicks(String referrer, long count) {
    }
}
