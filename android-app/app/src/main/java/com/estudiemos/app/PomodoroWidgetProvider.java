package com.estudiemos.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.time.LocalDate;

public class PomodoroWidgetProvider extends AppWidgetProvider {
    private static final String PREFS = "estudiemos_pomodoro_widget";
    private static final String KEY_STATE = "pomodoro_state";
    private static final String ACTION_TOGGLE = "com.estudiemos.app.POMODORO_TOGGLE";
    private static final String ACTION_RESET = "com.estudiemos.app.POMODORO_RESET";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) updateWidget(context, manager, appWidgetId);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_TOGGLE.equals(intent.getAction())) changeTimer(context, false);
        else if (ACTION_RESET.equals(intent.getAction())) changeTimer(context, true);
    }

    static void storeStateAndUpdate(Context context, String rawMessage) {
        try {
            JSONObject message = new JSONObject(rawMessage);
            if (!"pomodoro-sync".equals(message.optString("type"))) return;
            JSONObject state = message.optJSONObject("state");
            if (state == null) return;
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_STATE, state.toString())
                    .apply();
            notifyWidgets(context);
        } catch (Exception ignored) {}
    }

    static String getStateForWeb(Context context) {
        JSONObject state = readState(context);
        if (reconcile(state)) writeState(context, state);
        return state.toString();
    }

    private static void changeTimer(Context context, boolean reset) {
        JSONObject state = readState(context);
        reconcile(state);
        try {
            JSONObject config = config(state);
            String phase = "break".equals(state.optString("phase")) ? "break" : "study";
            long remaining = Math.max(0, state.optLong("remaining", config.optLong(phase, 25) * 60));
            captureStudyProgress(state, System.currentTimeMillis());
            if (reset) {
                remaining = Math.max(0, config.optLong(phase, 25) * 60);
                state.put("running", false);
                state.put("endAt", 0);
                state.put("studyCreditAt", 0);
            } else if (state.optBoolean("running", false)) {
                state.put("running", false);
                state.put("endAt", 0);
                state.put("studyCreditAt", 0);
            } else {
                if (remaining <= 0) remaining = Math.max(0, config.optLong(phase, 25) * 60);
                state.put("running", true);
                state.put("endAt", System.currentTimeMillis() + remaining * 1000);
                state.put("studyCreditAt", "study".equals(phase) ? System.currentTimeMillis() : 0);
            }
            state.put("remaining", remaining);
            state.put("updatedAt", System.currentTimeMillis());
            writeState(context, state);
            notifyWidgets(context);
        } catch (Exception ignored) {}
    }

    private static void notifyWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, PomodoroWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        for (int id : ids) updateWidget(context, manager, id);
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        JSONObject state = readState(context);
        if (reconcile(state)) writeState(context, state);
        JSONObject config = config(state);
        String phase = "break".equals(state.optString("phase")) ? "break" : "study";
        boolean running = state.optBoolean("running", false);
        long remaining = Math.max(0, state.optLong("remaining", config.optLong(phase, 25) * 60));
        int block = Math.max(1, state.optInt("currentBlock", 1));
        int blocks = Math.max(1, config.optInt("blocks", 1));
        long total = Math.max(1, config.optLong(phase, 25) * 60);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.pomodoro_widget);
        views.setTextViewText(R.id.pomodoro_widget_phase, "break".equals(phase) ? "DESCANSO" : "ESTUDIO");
        views.setTextViewText(R.id.pomodoro_widget_block, "break".equals(phase) ? "Descanso" : "Bloque " + block + " de " + blocks);
        views.setTextViewText(R.id.pomodoro_widget_toggle_label, running ? "Pausar" : "Empezar");
        views.setImageViewResource(R.id.pomodoro_widget_toggle_icon, running ? R.drawable.ic_widget_pause : R.drawable.ic_widget_play);
        views.setProgressBar(R.id.pomodoro_widget_progress, (int) Math.min(Integer.MAX_VALUE, total), (int) Math.min(total, total - remaining), false);
        long base = SystemClock.elapsedRealtime() + remaining * 1000;
        views.setChronometerCountDown(R.id.pomodoro_widget_time, true);
        views.setChronometer(R.id.pomodoro_widget_time, base, null, running);

        Intent toggleIntent = new Intent(context, PomodoroWidgetProvider.class).setAction(ACTION_TOGGLE);
        PendingIntent toggle = PendingIntent.getBroadcast(context, 4100 + appWidgetId, toggleIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.pomodoro_widget_toggle, toggle);
        views.setOnClickPendingIntent(R.id.pomodoro_widget_toggle_icon, toggle);

        Intent resetIntent = new Intent(context, PomodoroWidgetProvider.class).setAction(ACTION_RESET);
        PendingIntent reset = PendingIntent.getBroadcast(context, 4200 + appWidgetId, resetIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.pomodoro_widget_reset, reset);

        Intent openIntent = new Intent(context, MainActivity.class)
                .putExtra(MainActivity.EXTRA_OPEN_POMODORO, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open = PendingIntent.getActivity(context, 4300 + appWidgetId, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.pomodoro_widget_header, open);
        manager.updateAppWidget(appWidgetId, views);
    }

    private static JSONObject readState(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONObject state = new JSONObject(prefs.getString(KEY_STATE, "{}"));
            if (!state.has("config")) state.put("config", defaultConfig());
            if (!state.has("phase")) state.put("phase", "study");
            if (!state.has("currentBlock")) state.put("currentBlock", 1);
            if (!state.has("remaining")) state.put("remaining", config(state).optLong("study", 25) * 60);
            if (!state.has("pendingStudySeconds")) state.put("pendingStudySeconds", 0);
            if (!state.has("studyCreditAt")) state.put("studyCreditAt", 0);
            return state;
        } catch (Exception ignored) {
            JSONObject state = new JSONObject();
            try {
                state.put("config", defaultConfig());
                state.put("phase", "study");
                state.put("currentBlock", 1);
                state.put("remaining", 25 * 60);
                state.put("running", false);
                state.put("endAt", 0);
                state.put("updatedAt", 0);
                state.put("pendingStudySeconds", 0);
                state.put("studyCreditAt", 0);
            } catch (Exception ignoredAgain) {}
            return state;
        }
    }

    private static boolean reconcile(JSONObject state) {
        if (!state.optBoolean("running", false)) return false;
        long now = System.currentTimeMillis();
        long endAt = state.optLong("endAt", 0);
        long remaining = Math.max(0, (long) Math.ceil((endAt - now) / 1000.0));
        try {
            captureStudyProgress(state, now);
            state.put("remaining", remaining);
            if (remaining <= 0) {
                advanceCompletedPhase(state, now);
            }
            state.put("updatedAt", now);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static void captureStudyProgress(JSONObject state, long now) {
        if (!state.optBoolean("running", false) || !"study".equals(state.optString("phase"))) return;
        long startedAt = state.optLong("studyCreditAt", now);
        if (startedAt <= 0) startedAt = now;
        long endAt = state.optLong("endAt", 0);
        long cappedNow = endAt > 0 ? Math.min(now, endAt) : now;
        long elapsed = Math.max(0, (cappedNow - startedAt) / 1000);
        if (elapsed <= 0) return;
        try {
            state.put("pendingStudySeconds", Math.max(0, state.optLong("pendingStudySeconds", 0)) + elapsed);
            state.put("studyCreditAt", startedAt + elapsed * 1000);
        } catch (Exception ignored) { }
    }

    private static void advanceCompletedPhase(JSONObject state, long now) throws Exception {
        JSONObject config = config(state);
        String previousPhase = "break".equals(state.optString("phase")) ? "break" : "study";
        if ("study".equals(previousPhase)) {
            String today = LocalDate.now().toString();
            if (!today.equals(state.optString("completedDate"))) {
                state.put("completedDate", today);
                state.put("completedToday", 0);
            }
            state.put("completedToday", Math.max(0, state.optInt("completedToday", 0)) + 1);
            state.put("phase", "break");
        } else {
            int blocks = Math.max(1, config.optInt("blocks", 1));
            int current = Math.max(1, state.optInt("currentBlock", 1));
            state.put("currentBlock", current >= blocks ? 1 : current + 1);
            state.put("phase", "study");
        }

        String nextPhase = state.optString("phase", "study");
        long nextRemaining = Math.max(0, config.optLong(nextPhase, 25) * 60);
        boolean autoStart = state.optBoolean("autoStart", false) && nextRemaining > 0;
        state.put("remaining", nextRemaining);
        state.put("running", autoStart);
        state.put("endAt", autoStart ? now + nextRemaining * 1000 : 0);
        state.put("studyCreditAt", autoStart && "study".equals(nextPhase) ? now : 0);
    }

    private static JSONObject config(JSONObject state) {
        JSONObject config = state.optJSONObject("config");
        return config == null ? defaultConfig() : config;
    }

    private static JSONObject defaultConfig() {
        JSONObject config = new JSONObject();
        try {
            config.put("blocks", 1);
            config.put("study", 25);
            config.put("break", 5);
        } catch (Exception ignored) {}
        return config;
    }

    private static void writeState(Context context, JSONObject state) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_STATE, state.toString())
                .apply();
    }
}
