package com.estudiemos.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class WorkspaceWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "estudiemos_widget";
    static final String KEY_ITEMS = "workspace_items_json";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) updateWidget(context, manager, appWidgetId);
        manager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.workspace_widget_list);
    }

    static void storeWorkspaceAndUpdate(Context context, String rawMessage) {
        try {
            JSONObject message = new JSONObject(rawMessage);
            if (!"workspace-sync".equals(message.optString("type"))) return;
            JSONArray items = message.optJSONArray("items");
            if (items == null) return;
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_ITEMS, items.toString())
                    .apply();
            notifyDataChanged(context);
        } catch (Exception ignored) {
            // Keep the last complete list if a web message is interrupted.
        }
    }

    static List<WorkspaceEntry> readRootEntries(Context context) {
        List<WorkspaceEntry> entries = new ArrayList<>();
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_ITEMS, "[]");
        try {
            JSONArray items = new JSONArray(raw);
            for (int index = 0; index < items.length(); index += 1) {
                JSONObject item = items.optJSONObject(index);
                if (item == null || !item.isNull("parentId")) continue;
                String id = item.optString("id", "").trim();
                String name = item.optString("name", "").trim();
                String kind = "file".equals(item.optString("kind")) ? "file" : "folder";
                if (id.isEmpty() || name.isEmpty()) continue;
                entries.add(new WorkspaceEntry(id, name, kind, item.optString("mimeType", ""), item.optLong("sizeBytes", 0)));
            }
        } catch (Exception ignored) {
            return entries;
        }
        entries.sort(Comparator
                .comparing((WorkspaceEntry item) -> !"folder".equals(item.kind))
                .thenComparing(item -> item.name, String.CASE_INSENSITIVE_ORDER));
        return entries;
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.workspace_widget);
        Intent serviceIntent = new Intent(context, WorkspaceWidgetService.class);
        serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.workspace_widget_list, serviceIntent);
        views.setEmptyView(R.id.workspace_widget_list, R.id.workspace_widget_empty);

        Intent openItem = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent template = PendingIntent.getActivity(
                context,
                6100 + appWidgetId,
                openItem,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
        );
        views.setPendingIntentTemplate(R.id.workspace_widget_list, template);

        Intent openHome = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent home = PendingIntent.getActivity(
                context,
                6200 + appWidgetId,
                openHome,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.workspace_widget_header, home);
        views.setOnClickPendingIntent(R.id.workspace_widget_footer, home);

        int count = readRootEntries(context).size();
        views.setTextViewText(R.id.workspace_widget_count, count + (count == 1 ? " elemento" : " elementos"));
        manager.updateAppWidget(appWidgetId, views);
    }

    private static void notifyDataChanged(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, WorkspaceWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        for (int id : ids) updateWidget(context, manager, id);
        manager.notifyAppWidgetViewDataChanged(ids, R.id.workspace_widget_list);
    }

    static String formatSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        double kb = bytes / 1024d;
        if (kb < 1024) return Math.round(kb) + " KB";
        double mb = kb / 1024d;
        return (mb >= 10 ? Math.round(mb) : String.format(java.util.Locale.US, "%.1f", mb)) + " MB";
    }

    static final class WorkspaceEntry {
        final String id;
        final String name;
        final String kind;
        final String mimeType;
        final long sizeBytes;

        WorkspaceEntry(String id, String name, String kind, String mimeType, long sizeBytes) {
            this.id = id;
            this.name = name;
            this.kind = kind;
            this.mimeType = mimeType;
            this.sizeBytes = sizeBytes;
        }
    }
}
