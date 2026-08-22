package com.estudiemos.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import java.time.LocalDate;
import java.util.Calendar;

public class StreakReminderReceiver extends BroadcastReceiver {
    private static final String ACTION_REMIND = "com.estudiemos.app.STREAK_REMINDER";
    private static final String KEY_ENABLED = "pomodoro_streak_reminder_enabled";
    private static final String KEY_LAST_NOTICE = "pomodoro_streak_last_notice";
    private static final String CHANNEL_ID = "study_streak";
    private static final int NOTIFICATION_ID = 4201;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            scheduleDaily(context);
            return;
        }
        if (!ACTION_REMIND.equals(intent.getAction())) return;
        showReminderIfNeeded(context);
        scheduleDaily(context);
    }

    static void setEnabled(Context context, boolean enabled) {
        context.getSharedPreferences(StreakWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_ENABLED, enabled)
                .apply();
        if (enabled) scheduleDaily(context);
        else cancel(context);
    }

    static void scheduleDaily(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(StreakWidgetProvider.PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, false)) return;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;

        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, 20);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_YEAR, 1);
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), reminderIntent(context));
    }

    private static void cancel(Context context) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager != null) manager.cancel(reminderIntent(context));
    }

    private static PendingIntent reminderIntent(Context context) {
        Intent intent = new Intent(context, StreakReminderReceiver.class).setAction(ACTION_REMIND);
        return PendingIntent.getBroadcast(
                context,
                4200,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static void showReminderIfNeeded(Context context) {
        if (
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return;

        StreakWidgetProvider.StreakSummary summary = StreakWidgetProvider.readSummary(context);
        if (summary.activeToday || summary.activeLast7 == 0) return;
        SharedPreferences prefs = context.getSharedPreferences(StreakWidgetProvider.PREFS, Context.MODE_PRIVATE);
        String today = LocalDate.now().toString();
        if (today.equals(prefs.getString(KEY_LAST_NOTICE, ""))) return;

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Racha de estudio",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Un recordatorio diario para cuidar tu ritmo de estudio.");
            manager.createNotificationChannel(channel);
        }

        Intent openIntent = new Intent(context, MainActivity.class)
                .putExtra(MainActivity.EXTRA_OPEN_POMODORO, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                4202,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String body = summary.currentStreak > 0
                ? "Todavía estás a tiempo de mantener tu racha. 25 min alcanzan."
                : "Perdiste la racha, pero podés recuperar el ritmo con una sesión hoy.";
        android.app.Notification notification = new android.app.Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Tu racha sigue disponible")
                .setContentText(body)
                .setStyle(new android.app.Notification.BigTextStyle().bigText(body))
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .build();
        manager.notify(NOTIFICATION_ID, notification);
        prefs.edit().putString(KEY_LAST_NOTICE, today).apply();
    }
}
