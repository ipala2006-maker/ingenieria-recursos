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
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.workspace_widget_item);
            boolean folder = "folder".equals(entry.kind);
            views.setTextViewText(R.id.workspace_item_icon, folder ? "▰" : "▤");
            views.setTextViewText(R.id.workspace_item_name, entry.name);
            views.setTextViewText(R.id.workspace_item_meta, folder ? "Carpeta" : WorkspaceWidgetProvider.formatSize(entry.sizeBytes));

            Intent fillIn = new Intent();
            fillIn.putExtra(MainActivity.EXTRA_WORKSPACE_ITEM_ID, entry.id);
            fillIn.putExtra(MainActivity.EXTRA_WORKSPACE_ITEM_KIND, entry.kind);
            views.setOnClickFillInIntent(R.id.workspace_item_root, fillIn);
            return views;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return position < entries.size() ? entries.get(position).id.hashCode() : position; }
        @Override public boolean hasStableIds() { return true; }
    }
}
