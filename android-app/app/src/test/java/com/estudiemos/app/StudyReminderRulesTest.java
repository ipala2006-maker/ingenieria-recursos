package com.estudiemos.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.time.LocalDate;
import java.util.Locale;

public class StudyReminderRulesTest {
    private final LocalDate today = LocalDate.of(2026, 10, 18);

    @Test public void exactlyFiveSlotsEveryTwoAndAHalfHours() {
        assertEquals(5, StudyReminderRules.SLOTS.length);
        for (int i = 0; i < StudyReminderRules.SLOTS.length; i++) {
            int minute = StudyReminderRules.SLOTS[i];
            String slot = String.format(Locale.ROOT, "%02d:%02d", minute / 60, minute % 60);
            assertTrue(StudyReminderRules.due(slot, today.toString(), today, minute));
            assertTrue(StudyReminderRules.due(slot, today.toString(), today, minute + 4));
            assertFalse(StudyReminderRules.due(slot, today.toString(), today, minute - 1));
            assertFalse(StudyReminderRules.due(slot, today.toString(), today, minute + 5));
            if (i > 0) assertEquals(150, minute - StudyReminderRules.SLOTS[i - 1]);
        }
    }

    @Test public void oldJobsAndInvalidSlotsNeverCatchUp() {
        assertFalse(StudyReminderRules.due("12:00", "2026-10-17", today, 720));
        assertFalse(StudyReminderRules.due("12:00", today.toString(), today, 900));
        assertFalse(StudyReminderRules.due("13:00", today.toString(), today, 780));
        assertFalse(StudyReminderRules.due(null, today.toString(), today, 720));
    }
}
