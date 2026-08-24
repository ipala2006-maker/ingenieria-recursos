package com.estudiemos.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import java.time.LocalDate;
import java.time.format.TextStyle;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

public class CalendarWidgetProvider extends AppWidgetProvider {
    static final String KEY_VIEW = "calendar_view";
    static final String VIEW_WEEK = "week";
    static final String VIEW_MONTH = "month";
    private static final String ACTION_TOGGLE_VIEW = "com.estudiemos.app.CALENDAR_TOGGLE_VIEW";
    private static final DateTimeFormatter MONTH_FORMAT = DateTimeFormatter.ofPattern("MMMM 'de' yyyy", new Locale("es", "AR"));

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (!ACTION_TOGGLE_VIEW.equals(intent.getAction())) return;
        String current = getView(context);
        context.getSharedPreferences(AgendaWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_VIEW, VIEW_WEEK.equals(current) ? VIEW_MONTH : VIEW_WEEK)
                .apply();
        notifyDataChanged(context);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) updateWidget(context, manager, appWidgetId);
        manager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.calendar_widget_grid);
    }

    static void notifyDataChanged(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, CalendarWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        for (int id : ids) updateWidget(context, manager, id);
        manager.notifyAppWidgetViewDataChanged(ids, R.id.calendar_widget_grid);
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.calendar_widget);
        String view = getView(context);
        views.setTextViewText(R.id.calendar_widget_month, VIEW_WEEK.equals(view) ? weekLabel(LocalDate.now()) : capitalize(LocalDate.now().format(MONTH_FORMAT)));
        views.setTextViewText(R.id.calendar_widget_view_toggle, VIEW_WEEK.equals(view) ? "Semana" : "Mes");

        Intent serviceIntent = new Intent(context, CalendarWidgetService.class);
        serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.calendar_widget_grid, serviceIntent);

        Intent openIntent = new Intent(context, OpenAgendaActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openTemplate = PendingIntent.getActivity(
                context,
                3000 + appWidgetId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
        );
        views.setPendingIntentTemplate(R.id.calendar_widget_grid, openTemplate);
        views.setOnClickPendingIntent(R.id.calendar_widget_title, openTemplate);
        views.setOnClickPendingIntent(R.id.calendar_widget_footer, openTemplate);

        Intent toggleIntent = new Intent(context, CalendarWidgetProvider.class).setAction(ACTION_TOGGLE_VIEW);
        PendingIntent toggle = PendingIntent.getBroadcast(
                context,
                3300 + appWidgetId,
                toggleIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.calendar_widget_view_toggle, toggle);
        manager.updateAppWidget(appWidgetId, views);
    }

    static String getView(Context context) {
        String view = context.getSharedPreferences(AgendaWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .getString(KEY_VIEW, VIEW_WEEK);
        return VIEW_MONTH.equals(view) ? VIEW_MONTH : VIEW_WEEK;
    }

    private static String weekLabel(LocalDate date) {
        LocalDate start = date.minusDays(date.getDayOfWeek().getValue() - 1L);
        LocalDate end = start.plusDays(6);
        String month = end.getMonth().getDisplayName(TextStyle.FULL, new Locale("es", "AR"));
        if (start.getMonthValue() == end.getMonthValue()) {
            return start.getDayOfMonth() + " - " + end.getDayOfMonth() + " de " + month;
        }
        String firstMonth = start.getMonth().getDisplayName(TextStyle.SHORT, new Locale("es", "AR"));
        return start.getDayOfMonth() + " " + firstMonth + " - " + end.getDayOfMonth() + " " + month;
    }

    private static String capitalize(String value) {
        if (value == null || value.isEmpty()) return "";
        return value.substring(0, 1).toUpperCase(new Locale("es", "AR")) + value.substring(1);
    }
}
