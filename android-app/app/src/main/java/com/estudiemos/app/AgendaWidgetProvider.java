package com.estudiemos.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

public class AgendaWidgetProvider extends AppWidgetProvider {
    private static final String PREFS = "estudiemos_widget";
    private static final String KEY_AGENDA = "agenda_json";
    private static final DateTimeFormatter HEADER_FORMAT = DateTimeFormatter.ofPattern("EEE d MMM", new Locale("es", "AR"));
    private static final DateTimeFormatter DAY_FORMAT = DateTimeFormatter.ofPattern("EEE d MMM", new Locale("es", "AR"));

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) updateWidget(context, manager, appWidgetId);
    }

    static void storeAgendaAndUpdate(Context context, String rawMessage) {
        try {
            JSONObject message = new JSONObject(rawMessage);
            if (!"agenda-sync".equals(message.optString("type"))) return;
            JSONArray items = message.optJSONArray("items");
            if (items == null) return;
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_AGENDA, items.toString())
                    .apply();

            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            ComponentName component = new ComponentName(context, AgendaWidgetProvider.class);
            int[] ids = manager.getAppWidgetIds(component);
            for (int id : ids) updateWidget(context, manager, id);
        } catch (Exception ignored) {
            // Invalid messages never replace the last valid widget data.
        }
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.agenda_widget);
        LocalDate today = LocalDate.now();
        views.setTextViewText(R.id.widget_date, capitalize(today.format(HEADER_FORMAT)));
        views.setOnClickPendingIntent(R.id.widget_root, openAgendaIntent(context));

        List<AgendaEntry> entries = readUpcomingEntries(context, today);
        bindEntry(views, 0, entries.size() > 0 ? entries.get(0) : null);
        bindEntry(views, 1, entries.size() > 1 ? entries.get(1) : null);
        bindEntry(views, 2, entries.size() > 2 ? entries.get(2) : null);

        if (entries.isEmpty()) {
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            views.setTextViewText(R.id.widget_footer, "Tocá para abrir la agenda");
        } else {
            views.setViewVisibility(R.id.widget_empty, View.GONE);
            views.setTextViewText(R.id.widget_footer, entries.size() > 3 ? "+" + (entries.size() - 3) + " próximos" : "Abrir agenda");
        }
        manager.updateAppWidget(appWidgetId, views);
    }

    private static PendingIntent openAgendaIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class)
                .putExtra(MainActivity.EXTRA_OPEN_AGENDA, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                context,
                2001,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static List<AgendaEntry> readUpcomingEntries(Context context, LocalDate today) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_AGENDA, "[]");
        List<AgendaEntry> entries = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i += 1) {
                JSONObject item = array.optJSONObject(i);
                if (item == null || item.optBoolean("done", false)) continue;
                LocalDate date;
                try {
                    date = LocalDate.parse(item.optString("date"));
                } catch (Exception ignored) {
                    continue;
                }
                if (date.isBefore(today)) continue;
                String title = item.optString("title", "Pendiente").trim();
                String subject = item.optString("subject", "").trim();
                String type = item.optString("type", "Tarea").trim();
                String time = item.optString("horaInicio", "").trim();
                entries.add(new AgendaEntry(title, subject, type, time, date));
            }
        } catch (Exception ignored) {
            return entries;
        }
        entries.sort(Comparator.comparing((AgendaEntry item) -> item.date).thenComparing(item -> item.time));
        return entries;
    }

    private static void bindEntry(RemoteViews views, int index, AgendaEntry entry) {
        int[] rows = { R.id.widget_item_1, R.id.widget_item_2, R.id.widget_item_3 };
        int[] titles = { R.id.widget_item_1_title, R.id.widget_item_2_title, R.id.widget_item_3_title };
        int[] metas = { R.id.widget_item_1_meta, R.id.widget_item_2_meta, R.id.widget_item_3_meta };
        if (entry == null) {
            views.setViewVisibility(rows[index], View.GONE);
            return;
        }
        views.setViewVisibility(rows[index], View.VISIBLE);
        String leading = entry.time.isEmpty() ? "" : entry.time + "  ";
        views.setTextViewText(titles[index], leading + entry.title);
        String date = entry.date.equals(LocalDate.now()) ? "Hoy" : capitalize(entry.date.format(DAY_FORMAT));
        String context = entry.subject.isEmpty() ? entry.type : entry.subject + " · " + entry.type;
        views.setTextViewText(metas[index], date + " · " + context);
    }

    private static String capitalize(String value) {
        if (value == null || value.isEmpty()) return "";
        return value.substring(0, 1).toUpperCase(new Locale("es", "AR")) + value.substring(1);
    }

    private static final class AgendaEntry {
        final String title;
        final String subject;
        final String type;
        final String time;
        final LocalDate date;

        AgendaEntry(String title, String subject, String type, String time, LocalDate date) {
            this.title = title;
            this.subject = subject;
            this.type = type;
            this.time = time;
            this.date = date;
        }
    }
}
