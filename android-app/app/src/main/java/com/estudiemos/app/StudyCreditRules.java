package com.estudiemos.app;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

final class StudyCreditRules {
    private StudyCreditRules() { }

    static Map<String, Long> split(long start, long seconds, ZoneId zone) {
        Map<String, Long> days = new LinkedHashMap<>();
        while (seconds > 0) {
            ZonedDateTime date = Instant.ofEpochMilli(start).atZone(zone);
            long midnight = date.toLocalDate().plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli();
            long amount = Math.min(seconds, Math.max(1, (long) Math.ceil((midnight - start) / 1000.0)));
            String key = date.toLocalDate().toString();
            days.put(key, days.getOrDefault(key, 0L) + amount);
            seconds -= amount;
            start += amount * 1000;
        }
        return days;
    }

    static boolean timely(long endAt, long now) {
        return endAt > 0 && now - endAt <= 60000;
    }
}
