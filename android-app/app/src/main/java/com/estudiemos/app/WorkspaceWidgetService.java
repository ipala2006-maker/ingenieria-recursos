package com.estudiemos.app;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

public class WorkspaceWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new WorkspaceFactory(getApplicationContext());
    }

    private static final class WorkspaceFactory implements RemoteViewsFactory {
        private final Context context;
        private final List<WorkspaceWidgetProvider.WorkspaceEntry> entries = new ArrayList<>();

        WorkspaceFactory(Context context) {
            this.context = context;
        }

        @Override public void onCreate() { }

        @Override
        public void onDataSetChanged() {
            entries.clear();
            entries.addAll(WorkspaceWidgetProvider.readRootEntries(context));
        }

        @Override public void onDestroy() { entries.clear(); }
        @Override public int getCount() { return entries.size(); }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= entries.size()) return null;
            WorkspaceWidgetProvider.WorkspaceEntry entry = entries.get(position);
            if (ReleaseFeatures.DRIVE_WORKSPACE && !DriveWidgetRules.belongsTo(entry.owner, WidgetSyncManager.currentUserId(context))) return null;
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.workspace_widget_item);
            boolean folder = "folder".equals(entry.kind);
            views.setImageViewResource(R.id.workspace_item_icon, folder ? R.drawable.ic_widget_folder : R.drawable.ic_widget_file);
            views.setTextViewText(R.id.workspace_item_name, entry.name);
            views.setTextViewText(R.id.workspace_item_meta, folder ? "Carpeta" : entry.sizeBytes > 0 ? WorkspaceWidgetProvider.formatSize(entry.sizeBytes) : "Archivo");

            Intent fillIn = new Intent();
            if (ReleaseFeatures.DRIVE_WORKSPACE) {
                fillIn.putExtra(MainActivity.EXTRA_OPEN_DRIVE, true);
                fillIn.putExtra(MainActivity.EXTRA_DRIVE_ITEM_ID, entry.id);
                fillIn.putExtra(MainActivity.EXTRA_DRIVE_ITEM_KIND, entry.kind);
                fillIn.putExtra(MainActivity.EXTRA_DRIVE_OWNER, entry.owner);
            } else {
                fillIn.putExtra(MainActivity.EXTRA_WORKSPACE_ITEM_ID, entry.id);
                fillIn.putExtra(MainActivity.EXTRA_WORKSPACE_ITEM_KIND, entry.kind);
            }
            views.setOnClickFillInIntent(R.id.workspace_item_root, fillIn);
            return views;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return position < entries.size() ? entries.get(position).id.hashCode() : position; }
        @Override public boolean hasStableIds() { return true; }
    }
}
