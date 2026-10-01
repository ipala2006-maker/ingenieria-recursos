package com.estudiemos.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.ZoneId;
import java.util.Iterator;

public class InboxAlarmReceiver extends BroadcastReceiver {
    private static final String ACTION = "com.estudiemos.app.INBOX_ALARM";
    private static final String PREFS = "estudiemos_inbox_alarms";
    static final String CHANNEL = "inbox_alarms_v1";
    private static final long GRACE = 10 * 60 * 1000L;

    @Override public void onReceive(Context context, Intent intent) { refresh(context); }

    static boolean enabled(Context context) {
        return context.getSharedPreferences(PREFS, 0).getBoolean("enabled", false);
    }

    static void enable(Context context) {
        context.getSharedPreferences(PREFS, 0).edit().putBoolean("enabled", true).apply();
        channel(context);
        refresh(context);
    }

    static NotificationManager channel(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Alarmas de Inbox", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Tareas programadas, incluso con Estudiemos cerrado.");
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }
        return manager;
    }

    static boolean permitted(Context context) {
        NotificationManager manager = channel(context);
        return manager != null && manager.areNotificationsEnabled()
                && manager.getNotificationChannel(CHANNEL).getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    static synchronized void clear(Context context) {
        context.getSharedPreferences(PREFS, 0).edit().clear().apply();
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms != null) alarms.cancel(pending(context));
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) for (android.service.notification.StatusBarNotification notice : manager.getActiveNotifications()) {
            if ("inbox-alarm".equals(notice.getTag())) manager.cancel(notice.getTag(), notice.getId());
        }
    }

    private static PendingIntent pending(Context context) {
        return PendingIntent.getBroadcast(context, 4300,
                new Intent(context, InboxAlarmReceiver.class).setAction(ACTION),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // One OS alarm wakes the receiver for the next task; edits and cloud sync rebuild it.
    static synchronized void refresh(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        PendingIntent wake = pending(context);
        alarms.cancel(wake);
        if (!enabled(context) || !permitted(context)) return;
        long now = System.currentTimeMillis(), earliest = Long.MAX_VALUE;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, 0);
        try {
            JSONObject delivered = new JSONObject(prefs.getString("delivered", "{}"));
            Iterator<String> keys = delivered.keys();
            while (keys.hasNext()) if (delivered.optLong(keys.next()) < now - 7 * 86400000L) keys.remove();
            JSONArray items = new JSONArray(context.getSharedPreferences(AgendaWidgetProvider.PREFS, 0)
                    .getString(AgendaWidgetProvider.KEY_AGENDA, "[]"));
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null || item.optBoolean("done")) continue;
                JSONObject alarm = item.optJSONObject("alarm");
                String id = item.optString("id");
                if (alarm == null || id.isEmpty()) continue;
                long at = next(alarm, now - GRACE - 1);
                if (at > 0 && at <= now) {
                    String key = id + "|" + (at + InboxAlarmSchedule.LEAD_MS);
                    if (!delivered.has(key)) {
                        notifyTask(context, id, item.optString("title", "Tarea pendiente"));
                        delivered.put(key, now);
                    }
                    at = next(alarm, now);
                }
                if (at > now) earliest = Math.min(earliest, at);
            }
            prefs.edit().putString("delivered", delivered.toString()).apply();
            if (earliest == Long.MAX_VALUE) return;
            try {
                if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) {
                    alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, earliest, wake);
                } else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, earliest, wake);
            } catch (SecurityException revoked) {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, earliest, wake);
            }
        } catch (Exception error) {
            android.util.Log.w("Estudiemos", "Could not schedule Inbox alarms: " + error.getClass().getSimpleName());
        }
    }

    private static long next(JSONObject alarm, long after) {
        return InboxAlarmSchedule.nextTrigger(alarm.optString("date"), alarm.optString("time"),
                alarm.optString("repeat", "none"), after, ZoneId.systemDefault());
    }

    private static void notifyTask(Context context, String id, String title) {
        if (title.length() > 160) title = title.substring(0, 160);
        PendingIntent open = PendingIntent.getActivity(context, 4301,
                new Intent(context, MainActivity.class).putExtra(MainActivity.EXTRA_OPEN_AGENDA, true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification).setContentTitle(title)
                .setContentText("Es hora de tu tarea. Tocá para abrir Inbox.")
                .setStyle(new Notification.BigTextStyle().bigText(title))
                .setContentIntent(open).setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).build();
        channel(context).notify("inbox-alarm", id.hashCode(), notification);
    }
}
