package com.estudiemos.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.time.Instant;
import java.time.ZoneId;

public class InboxAlarmScheduleTest {
    private final ZoneId utc = ZoneId.of("UTC");
    private long at(String text) { return Instant.parse(text).toEpochMilli(); }
    @Test public void oneShotAndMalformed() {
        assertEquals(at("2026-09-30T12:00:00Z"), InboxAlarmSchedule.next("2026-09-30","12:00","none",at("2026-09-30T11:59:00Z"),utc));
        assertEquals(-1, InboxAlarmSchedule.next("2026-09-30","12:00","none",at("2026-09-30T12:00:00Z"),utc));
        assertEquals(-1, InboxAlarmSchedule.next("2026-99-99","12:00","daily",0,utc));
        assertEquals(-1, InboxAlarmSchedule.next("2026-09-30","25:00","daily",0,utc));
    }
    @Test public void repeatsRespectCalendar() {
        assertEquals(at("2026-10-05T12:00:00Z"), InboxAlarmSchedule.next("2026-10-02","12:00","weekdays",at("2026-10-02T12:00:00Z"),utc));
        assertEquals(at("2026-10-09T12:00:00Z"), InboxAlarmSchedule.next("2026-10-02","12:00","weekly",at("2026-10-02T12:00:00Z"),utc));
        assertEquals(at("2026-03-31T12:00:00Z"), InboxAlarmSchedule.next("2026-01-31","12:00","monthly",at("2026-01-31T12:00:00Z"),utc));
    }
    @Test public void deviceTimezoneAndDaylightSaving() {
        assertEquals(at("2026-09-30T15:00:00Z"), InboxAlarmSchedule.next("2026-09-30","12:00","none",at("2026-09-30T11:00:00Z"),ZoneId.of("America/Argentina/Buenos_Aires")));
        assertEquals(at("2026-03-08T07:30:00Z"), InboxAlarmSchedule.next("2026-03-08","02:30","daily",at("2026-03-08T06:00:00Z"),ZoneId.of("America/New_York")));
    }
}
