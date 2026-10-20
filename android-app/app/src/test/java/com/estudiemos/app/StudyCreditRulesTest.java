package com.estudiemos.app;

import org.junit.Test;
import java.time.ZonedDateTime;
import java.time.ZoneId;
import java.util.Map;
import static org.junit.Assert.*;

public class StudyCreditRulesTest {
    @Test public void overnightStudyBelongsToItsActualDates() {
        ZoneId zone = ZoneId.of("America/Argentina/Buenos_Aires");
        long start = ZonedDateTime.of(2026, 10, 19, 23, 50, 0, 0, zone).toInstant().toEpochMilli();
        Map<String, Long> days = StudyCreditRules.split(start, 900, zone);
        assertEquals(Long.valueOf(600), days.get("2026-10-19"));
        assertEquals(Long.valueOf(300), days.get("2026-10-20"));
    }

    @Test public void expiredSessionsDoNotStartNewBlocksOnReopen() {
        assertTrue(StudyCreditRules.timely(10000, 10050));
        assertFalse(StudyCreditRules.timely(10000, 100000));
        assertFalse(StudyCreditRules.timely(0, 10000));
    }

    @Test public void daylightSavingUsesTheRealMidnight() {
        ZoneId zone = ZoneId.of("America/New_York");
        long start = ZonedDateTime.of(2026, 3, 8, 0, 0, 0, 0, zone).toInstant().toEpochMilli();
        Map<String, Long> days = StudyCreditRules.split(start, 24 * 3600, zone);
        assertEquals(Long.valueOf(23 * 3600), days.get("2026-03-08"));
        assertEquals(Long.valueOf(3600), days.get("2026-03-09"));
    }
}
