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
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.text.Normalizer;

public class AgendaWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "estudiemos_widget";
    static final String KEY_AGENDA = "agenda_json";
    private static final String KEY_PENDING_COMPLETIONS = "agenda_pending_completions";
    private static final String ACTION_COMPLETE = "com.estudiemos.app.COMPLETE_AGENDA_ITEM";
    private static final String EXTRA_ITEM_ID = "agenda_item_id";
    private static final DateTimeFormatter HEADER_FORMAT = DateTimeFormatter.ofPattern("EEE d MMM", new Locale("es", "AR"));
    private static final DateTimeFormatter DAY_FORMAT = DateTimeFormatter.ofPattern("EEE d MMM", new Locale("es", "AR"));

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) updateWidget(context, manager, appWidgetId);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (!ACTION_COMPLETE.equals(intent.getAction())) return;
        String itemId = intent.getStringExtra(EXTRA_ITEM_ID);
        if (itemId == null || itemId.trim().isEmpty()) return;
        completeItem(context, itemId.trim());
    }

    static void storeAgendaAndUpdate(Context context, String rawMessage) {
        try {
            JSONObject message = new JSONObject(rawMessage);
            if (!"agenda-sync".equals(message.optString("type"))) return;
            JSONArray items = message.optJSONArray("items");
            if (items == null) return;
            storeAgendaItems(context, items.toString());
        } catch (Exception ignored) {
            // Invalid messages never replace the last valid widget data.
        }
    }

    static void storeAgendaItems(Context context, String rawItems) {
        try {
            JSONArray items = new JSONArray(rawItems);
            mergePendingCompletions(context, items);
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_AGENDA, items.toString())
                    .apply();

            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            ComponentName component = new ComponentName(context, AgendaWidgetProvider.class);
            int[] ids = manager.getAppWidgetIds(component);
            for (int id : ids) updateWidget(context, manager, id);
            CalendarWidgetProvider.notifyDataChanged(context);
        } catch (Exception ignored) {
            // Keep the last valid copy when Android receives incomplete data.
        }
    }

    static Set<String> getPendingCompletions(Context context) {
        return new HashSet<>(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getStringSet(KEY_PENDING_COMPLETIONS, new HashSet<>()));
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.agenda_widget);
        LocalDate today = LocalDate.now();
        views.setTextViewText(R.id.widget_date, capitalize(today.format(HEADER_FORMAT)));
        views.setOnClickPendingIntent(R.id.widget_root, openAgendaIntent(context));

        List<AgendaEntry> entries = readUpcomingEntries(context, today);
        bindEntry(context, views, appWidgetId, 0, entries.size() > 0 ? entries.get(0) : null);
        bindEntry(context, views, appWidgetId, 1, entries.size() > 1 ? entries.get(1) : null);
        bindEntry(context, views, appWidgetId, 2, entries.size() > 2 ? entries.get(2) : null);

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
        Intent intent = new Intent(context, OpenAgendaActivity.class)
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
                String type = item.optString("type", "Tarea").trim();
                if (!isAgendaType(type)) continue;
                LocalDate date = null;
                String rawDate = item.optString("date", "").trim();
                if (!rawDate.isEmpty()) {
                    try {
                        date = LocalDate.parse(rawDate);
                    } catch (Exception ignored) {
                        continue;
                    }
                }
                if (date != null && date.isBefore(today)) continue;
                String id = item.optString("id", "").trim();
                if (id.isEmpty()) continue;
                String title = item.optString("title", "Pendiente").trim();
                String subject = item.optString("subject", "").trim();
                String time = item.optString("horaInicio", "").trim();
                entries.add(new AgendaEntry(id, title, subject, type, time, date));
            }
        } catch (Exception ignored) {
            return entries;
        }
        entries.sort(Comparator
                .comparing((AgendaEntry item) -> item.date == null ? LocalDate.MIN : item.date)
                .thenComparing(item -> item.time));
        return entries;
    }

    private static boolean isAgendaType(String value) {
        String type = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(new Locale("es", "AR"));
        return !type.equals("clase");
    }

    private static void bindEntry(Context context, RemoteViews views, int appWidgetId, int index, AgendaEntry entry) {
        int[] rows = { R.id.widget_item_1, R.id.widget_item_2, R.id.widget_item_3 };
        int[] titles = { R.id.widget_item_1_title, R.id.widget_item_2_title, R.id.widget_item_3_title };
        int[] metas = { R.id.widget_item_1_meta, R.id.widget_item_2_meta, R.id.widget_item_3_meta };
        int[] doneButtons = { R.id.widget_item_1_done, R.id.widget_item_2_done, R.id.widget_item_3_done };
        if (entry == null) {
            views.setViewVisibility(rows[index], View.GONE);
            return;
        }
        views.setViewVisibility(rows[index], View.VISIBLE);
        String leading = entry.time.isEmpty() ? "" : entry.time + "  ";
        views.setTextViewText(titles[index], leading + entry.title);
        String date = entry.date == null
                ? "Sin fecha"
                : (entry.date.equals(LocalDate.now()) ? "Hoy" : capitalize(entry.date.format(DAY_FORMAT)));
        String contextLabel = entry.subject.isEmpty() ? entry.type : entry.subject + " · " + entry.type;
        views.setTextViewText(metas[index], date + " · " + contextLabel);
        views.setOnClickPendingIntent(doneButtons[index], completeItemIntent(context, appWidgetId, index, entry.id));
    }

    private static PendingIntent completeItemIntent(Context context, int appWidgetId, int index, String itemId) {
        Intent intent = new Intent(context, AgendaWidgetProvider.class)
                .setAction(ACTION_COMPLETE)
                .putExtra(EXTRA_ITEM_ID, itemId);
        return PendingIntent.getBroadcast(
                context,
                5000 + (appWidgetId * 10) + index,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static void completeItem(Context context, String itemId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray items = new JSONArray(prefs.getString(KEY_AGENDA, "[]"));
            boolean found = false;
            for (int index = 0; index < items.length(); index += 1) {
                JSONObject item = items.optJSONObject(index);
                if (item != null && itemId.equals(item.optString("id"))) {
                    item.put("done", true);
                    found = true;
                    break;
                }
            }
            if (!found) return;
            Set<String> pending = getPendingCompletions(context);
            pending.add(itemId);
            prefs.edit()
                    .putString(KEY_AGENDA, items.toString())
                    .putStringSet(KEY_PENDING_COMPLETIONS, pending)
                    .apply();
            updateAll(context);
        } catch (Exception ignored) {
            // Keep the last valid widget state.
        }
    }

    private static void mergePendingCompletions(Context context, JSONArray items) {
        Set<String> pending = getPendingCompletions(context);
        if (pending.isEmpty()) return;
        Set<String> acknowledged = new HashSet<>();
        Set<String> seen = new HashSet<>();
        for (int index = 0; index < items.length(); index += 1) {
            JSONObject item = items.optJSONObject(index);
            if (item == null) continue;
            String id = item.optString("id", "");
            if (!pending.contains(id)) continue;
            seen.add(id);
            if (item.optBoolean("done", false)) acknowledged.add(id);
            else {
                try { item.put("done", true); } catch (Exception ignored) { }
            }
        }
        for (String id : pending) {
            if (!seen.contains(id)) acknowledged.add(id);
        }
        if (!acknowledged.isEmpty()) {
            pending.removeAll(acknowledged);
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putStringSet(KEY_PENDING_COMPLETIONS, pending)
                    .apply();
        }
    }

    private static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, AgendaWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        for (int id : ids) updateWidget(context, manager, id);
        CalendarWidgetProvider.notifyDataChanged(context);
    }

    private static String capitalize(String value) {
        if (value == null || value.isEmpty()) return "";
        return value.substring(0, 1).toUpperCase(new Locale("es", "AR")) + value.substring(1);
    }

    private static final class AgendaEntry {
        final String id;
        final String title;
        final String subject;
        final String type;
        final String time;
        final LocalDate date;

        AgendaEntry(String id, String title, String subject, String type, String time, LocalDate date) {
            this.id = id;
            this.title = title;
            this.subject = subject;
            this.type = type;
            this.time = time;
            this.date = date;
        }
    }
}
