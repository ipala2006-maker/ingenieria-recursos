package com.estudiemos.app;

import android.app.job.JobParameters;
import android.app.job.JobService;

public class StreakReminderJobService extends JobService {
    private volatile boolean stopped;

    @Override
    public boolean onStartJob(JobParameters params) {
        stopped = false;
        String slot = params.getExtras().getString("reminder_slot", "");
        String day = params.getExtras().getString("day", "");
        if (!StreakReminderReceiver.currentSlot(slot, day) || !StreakReminderReceiver.isEnabled(this)) return false;
        if (StreakWidgetProvider.readSummary(this).activeToday) {
            StreakReminderReceiver.clearWhenComplete(this);
            return false;
        }
        WidgetSyncManager.refreshStudyGoal(this, () -> {
            if (!stopped && StreakReminderReceiver.currentSlot(slot, day)) StreakReminderReceiver.showReminderIfNeeded(this, slot);
        }, () -> jobFinished(params, false));
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { stopped = true; return false; }
}
