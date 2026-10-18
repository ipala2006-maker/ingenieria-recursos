package com.estudiemos.app;

import java.time.LocalDate;
import java.util.Locale;

final class StudyReminderRules {
    static final int[] SLOTS = {720, 870, 1020, 1170, 1320};
    private StudyReminderRules() {}

    static boolean due(String slotId, String day, LocalDate today, int minute) {
        if (!today.toString().equals(day)) return false;
        for (int slot : SLOTS) {
            String id = String.format(Locale.ROOT, "%02d:%02d", slot / 60, slot % 60);
            if (id.equals(slotId) && minute >= slot && minute < slot + 5) return true;
        }
        return false;
    }
}
