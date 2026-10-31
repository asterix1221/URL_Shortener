package com.example.shortener.link.dto;

import java.time.LocalDate;
import java.util.List;

public record LinkStatsResponse(String code, long totalClicks, List<DailyClicks> byDay,
                                 List<ReferrerClicks> topReferrers) {

    public record DailyClicks(LocalDate date, long count) {
    }

    public record ReferrerClicks(String referrer, long count) {
    }
}
