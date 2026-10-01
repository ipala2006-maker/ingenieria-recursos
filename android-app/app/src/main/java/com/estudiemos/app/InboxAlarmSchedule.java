package com.estudiemos.app;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.Instant;
import java.time.ZoneId;

final class InboxAlarmSchedule {
    static final long LEAD_MS = 30000L;
    private InboxAlarmSchedule() {}

    static long nextTrigger(String date, String time, String repeat, long after, ZoneId zone) {
        long nominal = next(date, time, repeat, after + LEAD_MS, zone);
        return nominal < 0 ? -1 : nominal - LEAD_MS;
    }

    static long next(String date, String time, String repeat, long after, ZoneId zone) {
        try {
            LocalDate start = LocalDate.parse(date);
            LocalTime clock = LocalTime.parse(time);
            if (start.getYear() < 2020 || start.getYear() > 2100 || !time.matches("\\d{2}:\\d{2}")) return -1;
            LocalDate day = Instant.ofEpochMilli(after).atZone(zone).toLocalDate();
            if (day.isBefore(start)) day = start;
            for (int i = 0; i < 371; i++, day = day.plusDays(1)) {
                boolean matches;
                switch (repeat) {
                    case "none": matches = day.equals(start); break;
                    case "daily": matches = true; break;
                    case "weekdays": matches = day.getDayOfWeek().getValue() <= 5; break;
                    case "weekly": matches = day.getDayOfWeek() == start.getDayOfWeek(); break;
                    case "monthly": matches = day.getDayOfMonth() == start.getDayOfMonth(); break;
                    default: return -1;
                }
                long at = day.atTime(clock).atZone(zone).toInstant().toEpochMilli();
                if (matches && at > after) return at;
                if ("none".equals(repeat)) return -1;
            }
        } catch (RuntimeException ignored) { }
        return -1;
    }
}
