package com.estudiemos.app;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class AgendaWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new AgendaFactory(getApplicationContext());
    }

    private static final class AgendaFactory implements RemoteViewsFactory {
        private static final DateTimeFormatter DAY_FORMAT = DateTimeFormatter.ofPattern("EEE d MMM", new Locale("es", "AR"));
        private final Context context;
        private final List<AgendaWidgetProvider.AgendaEntry> entries = new ArrayList<>();

        AgendaFactory(Context context) {
            this.context = context;
        }

        @Override public void onCreate() { }

        @Override
        public void onDataSetChanged() {
            entries.clear();
            entries.addAll(AgendaWidgetProvider.readUpcomingEntries(context, LocalDate.now()));
        }

        @Override public void onDestroy() { entries.clear(); }
        @Override public int getCount() { return entries.size(); }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= entries.size()) return null;
            AgendaWidgetProvider.AgendaEntry entry = entries.get(position);
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.agenda_widget_item);

            String leading = entry.time.isEmpty() ? "" : entry.time + "  ";
            views.setTextViewText(R.id.widget_item_title, leading + entry.title);

            String date = entry.date == null
                    ? "Sin fecha"
                    : (entry.date.equals(LocalDate.now()) ? "Hoy" : capitalize(entry.date.format(DAY_FORMAT)));
            String contextLabel = entry.subject.isEmpty() ? entry.type : entry.subject + " · " + entry.type;
            views.setTextViewText(R.id.widget_item_meta, date + " · " + contextLabel);

            Intent fillIn = new Intent();
            fillIn.putExtra(AgendaWidgetProvider.EXTRA_ITEM_ID, entry.id);
            views.setOnClickFillInIntent(R.id.widget_item_done, fillIn);
            return views;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return position < entries.size() ? entries.get(position).id.hashCode() : position; }
        @Override public boolean hasStableIds() { return true; }

        private static String capitalize(String value) {
            if (value == null || value.isEmpty()) return "";
            return value.substring(0, 1).toUpperCase(new Locale("es", "AR")) + value.substring(1);
        }
    }
}
