package com.estudiemos.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.time.LocalDate;

public class StreakWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "estudiemos_widget";
    static final String KEY_DAYS = "pomodoro_streak_days";
    static final String KEY_THRESHOLD = "pomodoro_streak_threshold";
    static final int DEFAULT_THRESHOLD = 25;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) updateWidget(context, manager, appWidgetId);
    }

    static void storeStreakAndUpdate(Context context, String rawMessage) {
        try {
            JSONObject message = new JSONObject(rawMessage);
            if (!"pomodoro-streak-sync".equals(message.optString("type"))) return;
            JSONObject days = message.optJSONObject("days");
            if (days == null) return;
            int threshold = Math.max(1, Math.min(180, message.optInt("threshold", DEFAULT_THRESHOLD)));
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_DAYS, days.toString())
                    .putInt(KEY_THRESHOLD, threshold)
                    .apply();
            updateAll(context);
        } catch (Exception ignored) {
            // The widget keeps the last valid local history.
        }
    }

    static void storeStreakHistory(Context context, String rawHistory) {
        try {
            JSONObject history = new JSONObject(rawHistory);
            JSONObject days = history.optJSONObject("days");
            if (days == null) return;
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_DAYS, days.toString())
                    .putInt(KEY_THRESHOLD, DEFAULT_THRESHOLD)
                    .apply();
            updateAll(context);
        } catch (Exception ignored) {
            // The widget keeps the last valid local history.
        }
    }

    static StreakSummary readSummary(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int threshold = Math.max(1, prefs.getInt(KEY_THRESHOLD, DEFAULT_THRESHOLD));
        JSONObject days;
        try {
            days = new JSONObject(prefs.getString(KEY_DAYS, "{}"));
        } catch (Exception ignored) {
            days = new JSONObject();
        }

        LocalDate today = LocalDate.now();
        int todayMinutes = minutesFor(days, today);
        boolean activeToday = todayMinutes >= threshold;
        LocalDate cursor = activeToday ? today : today.minusDays(1);
        int streak = 0;
        while (minutesFor(days, cursor) >= threshold && streak < 730) {
            streak += 1;
            cursor = cursor.minusDays(1);
        }

        int activeLast7 = 0;
        for (int offset = 0; offset < 7; offset += 1) {
            if (minutesFor(days, today.minusDays(offset)) >= threshold) activeLast7 += 1;
        }
        return new StreakSummary(streak, activeLast7, todayMinutes, threshold, activeToday);
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, StreakWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        for (int id : ids) updateWidget(context, manager, id);
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        StreakSummary summary = readSummary(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.streak_widget);
        String daysLabel = summary.currentStreak == 1 ? "día" : "días";
        String title;
        if (summary.currentStreak > 0) title = "Racha: " + summary.currentStreak + " " + daysLabel;
        else if (summary.activeLast7 > 0) title = "Recuperá el ritmo hoy";
        else title = "Empezá tu racha";

        views.setTextViewText(R.id.streak_widget_title, title);
        views.setTextViewText(
                R.id.streak_widget_action,
                summary.activeToday ? "Presencia de hoy registrada" : "Tocá para estudiar 25 min"
        );
        views.setTextViewText(
                R.id.streak_widget_week,
                "Últimos 7 días: " + summary.activeLast7 + " activos"
        );
        views.setOnClickPendingIntent(R.id.streak_widget_root, openPomodoroIntent(context));
        manager.updateAppWidget(appWidgetId, views);
    }

    private static int minutesFor(JSONObject days, LocalDate date) {
        return Math.max(0, days.optInt(date.toString(), 0));
    }

    private static PendingIntent openPomodoroIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class)
                .putExtra(MainActivity.EXTRA_OPEN_POMODORO, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                context,
                3001,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    static final class StreakSummary {
        final int currentStreak;
        final int activeLast7;
        final int todayMinutes;
        final int threshold;
        final boolean activeToday;

        StreakSummary(int currentStreak, int activeLast7, int todayMinutes, int threshold, boolean activeToday) {
            this.currentStreak = currentStreak;
            this.activeLast7 = activeLast7;
            this.todayMinutes = todayMinutes;
            this.threshold = threshold;
            this.activeToday = activeToday;
        }
    }
}
