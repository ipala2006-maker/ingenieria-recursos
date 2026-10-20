package com.estudiemos.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class WorkspaceWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "estudiemos_widget";
    static final String KEY_ITEMS = "workspace_items_json";
    private static final String KEY_DRIVE_ITEMS = "drive_widget_items";
    private static final String KEY_DRIVE_OWNER = "drive_widget_owner";
    private static final String KEY_DRIVE_CONNECTED = "drive_widget_connected";
    private static final String KEY_DRIVE_LOCATION = "drive_widget_location";
    private static final String KEY_DRIVE_LIMITED = "drive_widget_limited";

    static void storeDriveAndUpdate(Context context, String rawMessage) {
        if (!ReleaseFeatures.DRIVE_WORKSPACE || rawMessage == null || rawMessage.length() > 65536) return;
        try {
            JSONObject message = new JSONObject(rawMessage);
            String owner = message.optString("owner", "");
            if (!"drive-workspace-sync".equals(message.optString("type"))
                    || !DriveWidgetRules.belongsTo(owner, WidgetSyncManager.currentUserId(context))) return;
            JSONArray source = message.optJSONArray("items");
            if (source == null) return;
            boolean connected = message.optBoolean("connected", false);
            JSONArray items = new JSONArray();
            for (int index = 0; connected && index < Math.min(source.length(), DriveWidgetRules.MAX_ITEMS); index++) {
                JSONObject row = source.optJSONObject(index);
                if (row == null || !row.isNull("parentId")) continue;
                String id = row.optString("id", ""), name = DriveWidgetRules.cleanName(row.optString("name", ""));
                if (!DriveWidgetRules.validId(id) || name.isEmpty()) continue;
                JSONObject item = new JSONObject();
                item.put("id", id); item.put("name", name); item.put("parentId", JSONObject.NULL);
                item.put("kind", "folder".equals(row.optString("kind")) ? "folder" : "file");
                item.put("mimeType", "");
                item.put("sizeBytes", Math.max(0, row.optLong("sizeBytes", 0)));
                items.put(item);
            }
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString(KEY_DRIVE_OWNER, owner).putString(KEY_DRIVE_ITEMS, items.toString())
                    .putBoolean(KEY_DRIVE_CONNECTED, connected)
                    .putString(KEY_DRIVE_LOCATION, "unit".equals(message.optString("location")) ? "Mi unidad" : "Estudiemos")
                    .putBoolean(KEY_DRIVE_LIMITED, message.optBoolean("truncated") || source.length() > DriveWidgetRules.MAX_ITEMS)
                    .apply();
            notifyDataChanged(context);
        } catch (Exception ignored) {
            // An interrupted message never replaces the last complete private preview.
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) updateWidget(context, manager, appWidgetId);
        manager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.workspace_widget_list);
        WidgetSyncManager.syncNow(context);
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

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        updateWidget(context, manager, id);
    }

    static void storeWorkspaceItems(Context context, JSONArray items) {
        if (items == null) return;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_ITEMS, items.toString())
                .apply();
        notifyDataChanged(context);
    }

    static void clearForAccount(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(KEY_ITEMS)
                .remove(KEY_DRIVE_ITEMS).remove(KEY_DRIVE_OWNER).remove(KEY_DRIVE_CONNECTED)
                .remove(KEY_DRIVE_LOCATION).remove(KEY_DRIVE_LIMITED)
                .apply();
        notifyDataChanged(context);
    }

    static List<WorkspaceEntry> readRootEntries(Context context) {
        List<WorkspaceEntry> entries = new ArrayList<>();
        if (!ReleaseFeatures.DRIVE_WORKSPACE && !ReleaseFeatures.WORKSPACE) return entries;
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String owner = prefs.getString(KEY_DRIVE_OWNER, "");
        if (ReleaseFeatures.DRIVE_WORKSPACE && (!prefs.getBoolean(KEY_DRIVE_CONNECTED, false)
                || !DriveWidgetRules.belongsTo(owner, WidgetSyncManager.currentUserId(context)))) return entries;
        String raw = prefs.getString(ReleaseFeatures.DRIVE_WORKSPACE ? KEY_DRIVE_ITEMS : KEY_ITEMS, "[]");
        try {
            JSONArray items = new JSONArray(raw);
            for (int index = 0; index < items.length(); index += 1) {
                JSONObject item = items.optJSONObject(index);
                if (item == null || !item.isNull("parentId")) continue;
                String id = item.optString("id", "").trim();
                String name = item.optString("name", "").trim();
                String kind = "file".equals(item.optString("kind")) ? "file" : "folder";
                if (id.isEmpty() || name.isEmpty()) continue;
                if (ReleaseFeatures.DRIVE_WORKSPACE && !DriveWidgetRules.validId(id)) continue;
                entries.add(new WorkspaceEntry(id, name, kind, item.optString("mimeType", ""), item.optLong("sizeBytes", 0), owner));
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
        boolean compact = new WidgetSize(context, manager, appWidgetId).height < 160;
        views.setViewVisibility(R.id.workspace_widget_subtitle, compact ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.workspace_widget_footer, compact ? View.GONE : View.VISIBLE);
        Intent serviceIntent = new Intent(context, WorkspaceWidgetService.class);
        serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.workspace_widget_list, serviceIntent);
        views.setEmptyView(R.id.workspace_widget_list, R.id.workspace_widget_empty);
        if (ReleaseFeatures.DRIVE_WORKSPACE) {
            android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            boolean signedIn = !WidgetSyncManager.currentUserId(context).isEmpty();
            boolean connected = DriveWidgetRules.belongsTo(prefs.getString(KEY_DRIVE_OWNER, ""), WidgetSyncManager.currentUserId(context))
                    && prefs.getBoolean(KEY_DRIVE_CONNECTED, false);
            views.setTextViewText(R.id.workspace_widget_empty, !signedIn ? "Ingresá a Estudiemos para ver tus archivos"
                    : connected ? "No hay archivos en esta ubicación" : "Abrí Mi espacio para conectar o actualizar Google Drive");
            views.setTextViewText(R.id.workspace_widget_subtitle, "Google Drive · " + (connected ? prefs.getString(KEY_DRIVE_LOCATION, "Mi espacio") : "Mi espacio"));
            views.setTextViewText(R.id.workspace_widget_footer, "Abrir Mi espacio · Actualizar vista");
        } else if (!ReleaseFeatures.WORKSPACE) {
            views.setTextViewText(R.id.workspace_widget_empty, "Próximamente");
            views.setTextViewText(R.id.workspace_widget_subtitle, "Disponible en una próxima etapa");
        }

        Intent openItem = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (ReleaseFeatures.DRIVE_WORKSPACE) openItem.putExtra(MainActivity.EXTRA_OPEN_DRIVE, true);
        PendingIntent template = PendingIntent.getActivity(
                context,
                6100 + appWidgetId,
                openItem,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
        );
        views.setPendingIntentTemplate(R.id.workspace_widget_list, template);

        Intent openHome = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (ReleaseFeatures.DRIVE_WORKSPACE) openHome.putExtra(MainActivity.EXTRA_OPEN_DRIVE, true);
        PendingIntent home = PendingIntent.getActivity(
                context,
                6200 + appWidgetId,
                openHome,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.workspace_widget_header, home);
        views.setOnClickPendingIntent(R.id.workspace_widget_footer, home);
        views.setOnClickPendingIntent(R.id.workspace_widget_empty, home);

        int count = readRootEntries(context).size();
        boolean limited = ReleaseFeatures.DRIVE_WORKSPACE && count == DriveWidgetRules.MAX_ITEMS
                && context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_DRIVE_LIMITED, false);
        views.setTextViewText(R.id.workspace_widget_count, count + (limited ? "+" : ""));
        views.setContentDescription(R.id.workspace_widget_count, count + (count == 1 ? " elemento" : " elementos"));
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
        final String owner;

        WorkspaceEntry(String id, String name, String kind, String mimeType, long sizeBytes, String owner) {
            this.id = id;
            this.name = name;
            this.kind = kind;
            this.mimeType = mimeType;
            this.sizeBytes = sizeBytes;
            this.owner = owner;
        }
    }
}
