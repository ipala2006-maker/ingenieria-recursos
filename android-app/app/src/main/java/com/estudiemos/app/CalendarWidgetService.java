package com.estudiemos.app;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class CalendarWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new CalendarFactory(getApplicationContext());
    }

    private static final class CalendarFactory implements RemoteViewsFactory {
        private final Context context;
        private final List<CalendarDay> days = new ArrayList<>();

        CalendarFactory(Context context) {
            this.context = context;
        }

        @Override public void onCreate() { }

        @Override
        public void onDataSetChanged() {
            days.clear();
            LocalDate today = LocalDate.now();
            LocalDate first = today.withDayOfMonth(1);
            int offset = first.getDayOfWeek().getValue() - 1;
            LocalDate gridStart = first.minusDays(offset);
            Map<LocalDate, List<ClassEntry>> classes = readClasses(context);

            for (int index = 0; index < 42; index += 1) {
                LocalDate date = gridStart.plusDays(index);
                List<ClassEntry> entries = classes.getOrDefault(date, new ArrayList<>());
                entries.sort(Comparator
                        .comparing((ClassEntry entry) -> entry.start.isEmpty() ? "99:99" : entry.start)
                        .thenComparing(entry -> entry.title));
                days.add(new CalendarDay(date, date.getMonthValue() == today.getMonthValue(), date.equals(today), entries));
            }
        }

        @Override public void onDestroy() { days.clear(); }
        @Override public int getCount() { return days.size(); }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= days.size()) return null;
            CalendarDay day = days.get(position);
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.calendar_widget_day);
            views.setTextViewText(R.id.calendar_day_number, String.valueOf(day.date.getDayOfMonth()));
            views.setTextViewText(R.id.calendar_day_events, summarize(day.entries));
            views.setViewVisibility(R.id.calendar_day_events, day.entries.isEmpty() ? View.INVISIBLE : View.VISIBLE);

            int background = day.today
                    ? R.drawable.calendar_day_today
                    : (day.currentMonth ? R.drawable.calendar_day_background : R.drawable.calendar_day_outside);
            views.setInt(R.id.calendar_day_root, "setBackgroundResource", background);
            views.setTextColor(R.id.calendar_day_number, day.currentMonth ? 0xFFF1F5F9 : 0xFF64748B);
            views.setTextColor(R.id.calendar_day_events, day.today ? 0xFF07111F : 0xFFB8D2FF);

            Intent fillIn = new Intent();
            fillIn.putExtra(OpenAgendaActivity.EXTRA_DATE, day.date.toString());
            views.setOnClickFillInIntent(R.id.calendar_day_root, fillIn);
            return views;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return position < days.size() ? days.get(position).date.toEpochDay() : position; }
        @Override public boolean hasStableIds() { return true; }

        private static String summarize(List<ClassEntry> entries) {
            if (entries.isEmpty()) return "";
            List<String> lines = new ArrayList<>();
            int visible = Math.min(2, entries.size());
            for (int index = 0; index < visible; index += 1) {
                ClassEntry entry = entries.get(index);
                String time = entry.start.isEmpty()
                        ? ""
                        : entry.start + (entry.end.isEmpty() ? "" : "-" + entry.end) + " ";
                lines.add(time + entry.title);
            }
            if (entries.size() > visible) lines.add("+" + (entries.size() - visible) + " más");
            return String.join("\n", lines);
        }

        private static Map<LocalDate, List<ClassEntry>> readClasses(Context context) {
            SharedPreferences prefs = context.getSharedPreferences(AgendaWidgetProvider.PREFS, Context.MODE_PRIVATE);
            String raw = prefs.getString(AgendaWidgetProvider.KEY_AGENDA, "[]");
            Map<LocalDate, List<ClassEntry>> result = new HashMap<>();
            try {
                JSONArray array = new JSONArray(raw);
                for (int index = 0; index < array.length(); index += 1) {
                    JSONObject item = array.optJSONObject(index);
                    if (item == null || item.optBoolean("done", false)) continue;
                    if (!"clase".equals(item.optString("type").trim().toLowerCase(new Locale("es", "AR")))) continue;
                    String start = item.optString("horaInicio").trim();
                    String end = item.optString("horaFin").trim();

                    LocalDate date;
                    try {
                        date = LocalDate.parse(item.optString("date"));
                    } catch (Exception ignored) {
                        continue;
                    }
                    String subject = item.optString("subject").trim();
                    String title = subject.isEmpty() ? item.optString("title", "Clase").trim() : subject;
                    result.computeIfAbsent(date, ignored -> new ArrayList<>()).add(new ClassEntry(title, start, end));
                }
            } catch (Exception ignored) {
                return result;
            }
            return result;
        }
    }

    private static final class CalendarDay {
        final LocalDate date;
        final boolean currentMonth;
        final boolean today;
        final List<ClassEntry> entries;

        CalendarDay(LocalDate date, boolean currentMonth, boolean today, List<ClassEntry> entries) {
            this.date = date;
            this.currentMonth = currentMonth;
            this.today = today;
            this.entries = entries;
        }
    }

    private static final class ClassEntry {
        final String title;
        final String start;
        final String end;

        ClassEntry(String title, String start, String end) {
            this.title = title;
            this.start = start;
            this.end = end;
        }
    }
}
