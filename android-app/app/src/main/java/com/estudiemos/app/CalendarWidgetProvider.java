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
import java.time.format.DateTimeFormatter;
import java.util.Locale;

public class CalendarWidgetProvider extends AppWidgetProvider {
    private static final DateTimeFormatter MONTH_FORMAT = DateTimeFormatter.ofPattern("MMMM 'de' yyyy", new Locale("es", "AR"));

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
        String month = LocalDate.now().format(MONTH_FORMAT);
        views.setTextViewText(R.id.calendar_widget_month, capitalize(month));

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
        views.setOnClickPendingIntent(R.id.calendar_widget_header, openTemplate);
        views.setOnClickPendingIntent(R.id.calendar_widget_footer, openTemplate);
        manager.updateAppWidget(appWidgetId, views);
    }

    private static String capitalize(String value) {
        if (value == null || value.isEmpty()) return "";
        return value.substring(0, 1).toUpperCase(new Locale("es", "AR")) + value.substring(1);
    }
}
