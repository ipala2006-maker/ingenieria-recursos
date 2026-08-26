package com.estudiemos.app;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

final class WidgetSyncManager {
    private static final String PREFS = "estudiemos_widget_cloud";
    private static final String KEY_URL = "supabase_url";
    private static final String KEY_PUBLIC_KEY = "supabase_public_key";
    private static final String KEY_USER_ID = "user_id";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_REFRESH_TOKEN = "refresh_token";
    private static final String KEY_EXPIRES_AT = "expires_at";
    private static final String KEY_PUSH_TOKEN = "push_token";
    private static final int JOB_ID = 0x455357;
    private static final long PERIOD_MS = 15 * 60 * 1000L;
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean RUNNING = new AtomicBoolean(false);

    private WidgetSyncManager() {}

    static void handleAccountMessage(Context context, JSONObject payload) {
        Context appContext = context.getApplicationContext();
        if (payload.optBoolean("signedOut", false)) {
            clearSessionAndWidgets(appContext);
            return;
        }

        JSONObject config = payload.optJSONObject("config");
        JSONObject session = payload.optJSONObject("session");
        if (config == null || session == null) return;

        String url = normalizeSupabaseUrl(config.optString("url", ""));
        String publicKey = config.optString("publishableKey", "").trim();
        String userId = session.optString("userId", "").trim();
        String accessToken = session.optString("accessToken", "").trim();
        String refreshToken = session.optString("refreshToken", "").trim();
        long expiresAt = Math.max(0, session.optLong("expiresAt", 0));
        if (url.isEmpty() || publicKey.isEmpty() || userId.isEmpty() || accessToken.isEmpty()) return;

        SharedPreferences prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String previousUser = prefs.getString(KEY_USER_ID, "");
        if (!previousUser.isEmpty() && !previousUser.equals(userId)) clearWidgetData(appContext);
        prefs.edit()
                .putString(KEY_URL, url)
                .putString(KEY_PUBLIC_KEY, publicKey)
                .putString(KEY_USER_ID, userId)
                .putString(KEY_ACCESS_TOKEN, accessToken)
                .putString(KEY_REFRESH_TOKEN, refreshToken)
                .putLong(KEY_EXPIRES_AT, expiresAt)
                .apply();
        schedule(appContext);
        syncNow(appContext);
    }

    static void syncNow(Context context) {
        Context appContext = context.getApplicationContext();
        if (!hasSession(appContext) || !RUNNING.compareAndSet(false, true)) return;
        EXECUTOR.execute(() -> {
            try {
                synchronize(appContext);
            } finally {
                RUNNING.set(false);
            }
        });
    }

    static void runJob(Context context, Runnable finished) {
        Context appContext = context.getApplicationContext();
        if (!hasSession(appContext) || !RUNNING.compareAndSet(false, true)) {
            finished.run();
            return;
        }
        EXECUTOR.execute(() -> {
            try {
                synchronize(appContext);
            } finally {
                RUNNING.set(false);
                finished.run();
            }
        });
    }

    private static void schedule(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(context, WidgetSyncJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .setPeriodic(PERIOD_MS)
                .build();
        scheduler.schedule(job);
    }

    private static void synchronize(Context context) {
        Session session = ensureFreshSession(context);
        if (session == null) return;

        Response stateResponse = get(session, "/rest/v1/user_states?select=state,updated_at&limit=1");
        if (stateResponse.code < 200 || stateResponse.code >= 300) return;

        Response workspaceResponse = get(
                session,
                "/rest/v1/workspace_items?select=id,parent_id,kind,name,mime_type,size_bytes,updated_at&order=updated_at.desc"
        );
        applyCloudState(context, stateResponse.body);
        if (workspaceResponse.code >= 200 && workspaceResponse.code < 300) {
            applyWorkspace(context, workspaceResponse.body);
        }
    }

    private static void applyCloudState(Context context, String raw) {
        try {
            JSONArray rows = new JSONArray(raw);
            JSONObject row = rows.length() > 0 ? rows.optJSONObject(0) : null;
            JSONObject state = row == null ? null : row.optJSONObject("state");
            JSONObject values = state == null ? null : state.optJSONObject("values");
            if (values == null) return;

            JSONArray agenda = asArray(values.opt("bandeja_agenda"));
            if (agenda != null) AgendaWidgetProvider.storeAgendaItems(context, agenda.toString());

            JSONObject streak = asObject(values.opt("estudiemos_pomodoro_streak"));
            if (streak != null) StreakWidgetProvider.storeStreakHistory(context, streak.toString());
        } catch (Exception ignored) {
            // Widgets retain their last complete state if a response is interrupted.
        }
    }

    private static void applyWorkspace(Context context, String raw) {
        try {
            JSONArray source = new JSONArray(raw);
            JSONArray items = new JSONArray();
            for (int index = 0; index < source.length(); index += 1) {
                JSONObject row = source.optJSONObject(index);
                if (row == null) continue;
                JSONObject item = new JSONObject();
                item.put("id", row.optString("id", ""));
                item.put("parentId", row.isNull("parent_id") ? JSONObject.NULL : row.optString("parent_id", ""));
                item.put("kind", row.optString("kind", "folder"));
                item.put("name", row.optString("name", ""));
                item.put("mimeType", row.optString("mime_type", ""));
                item.put("sizeBytes", Math.max(0, row.optLong("size_bytes", 0)));
                item.put("updatedAt", row.optString("updated_at", ""));
                items.put(item);
            }
            WorkspaceWidgetProvider.storeWorkspaceItems(context, items);
        } catch (Exception ignored) {
            // Keep the previous list until a complete response is available.
        }
    }

    private static JSONArray asArray(Object value) {
        try {
            if (value instanceof JSONArray) return (JSONArray) value;
            if (value instanceof String) return new JSONArray((String) value);
        } catch (Exception ignored) {}
        return null;
    }

    private static JSONObject asObject(Object value) {
        try {
            if (value instanceof JSONObject) return (JSONObject) value;
            if (value instanceof String) return new JSONObject((String) value);
        } catch (Exception ignored) {}
        return null;
    }

    private static Response get(Session session, String path) {
        return request("GET", session.url + path, session.publicKey, session.accessToken, null);
    }

    private static Response request(String method, String target, String publicKey, String accessToken, String body) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(target).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(15000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("apikey", publicKey);
            if (!accessToken.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + accessToken);
            if (body != null) {
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(bytes);
                }
            }
            int code = connection.getResponseCode();
            InputStream stream = code >= 200 && code < 400 ? connection.getInputStream() : connection.getErrorStream();
            return new Response(code, readStream(stream));
        } catch (Exception ignored) {
            return new Response(0, "");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String readStream(InputStream stream) {
        if (stream == null) return "";
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
        } catch (Exception ignored) {}
        return result.toString();
    }

    private static Session readSession(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String url = normalizeSupabaseUrl(prefs.getString(KEY_URL, ""));
        String publicKey = prefs.getString(KEY_PUBLIC_KEY, "");
        String userId = prefs.getString(KEY_USER_ID, "");
        String accessToken = prefs.getString(KEY_ACCESS_TOKEN, "");
        if (url.isEmpty() || publicKey.isEmpty() || userId.isEmpty() || accessToken.isEmpty()) return null;
        return new Session(
                url,
                publicKey,
                userId,
                accessToken,
                prefs.getString(KEY_REFRESH_TOKEN, ""),
                prefs.getLong(KEY_EXPIRES_AT, 0)
        );
    }

    private static Session ensureFreshSession(Context context) {
        Session session = readSession(context);
        if (session == null) return null;
        long now = System.currentTimeMillis() / 1000L;
        if (session.expiresAt > now + 90L) return session;
        if (session.refreshToken.isEmpty()) return null;

        JSONObject body = new JSONObject();
        try {
            body.put("refresh_token", session.refreshToken);
        } catch (Exception ignored) {
            return null;
        }
        Response response = request(
                "POST",
                session.url + "/auth/v1/token?grant_type=refresh_token",
                session.publicKey,
                "",
                body.toString()
        );
        if (response.code < 200 || response.code >= 300) return null;
        try {
            JSONObject refreshed = new JSONObject(response.body);
            String accessToken = refreshed.optString("access_token", "").trim();
            String refreshToken = refreshed.optString("refresh_token", session.refreshToken).trim();
            long expiresIn = Math.max(60L, refreshed.optLong("expires_in", 3600L));
            if (accessToken.isEmpty() || refreshToken.isEmpty()) return null;
            long expiresAt = now + expiresIn;
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString(KEY_ACCESS_TOKEN, accessToken)
                    .putString(KEY_REFRESH_TOKEN, refreshToken)
                    .putLong(KEY_EXPIRES_AT, expiresAt)
                    .apply();
            return new Session(
                    session.url,
                    session.publicKey,
                    session.userId,
                    accessToken,
                    refreshToken,
                    expiresAt
            );
        } catch (Exception ignored) {
            return null;
        }
    }

    static void storePushToken(Context context, String token) {
        String clean = token == null ? "" : token.trim();
        if (clean.isEmpty()) return;
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_PUSH_TOKEN, clean)
                .apply();
    }

    static String getPushToken(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_PUSH_TOKEN, "");
    }

    static JSONObject getSessionForWeb(Context context) {
        Session session = readSession(context.getApplicationContext());
        if (session == null || session.refreshToken.isEmpty()) return null;
        try {
            return new JSONObject()
                    .put("accessToken", session.accessToken)
                    .put("refreshToken", session.refreshToken)
                    .put("expiresAt", session.expiresAt);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean hasSession(Context context) {
        return readSession(context) != null;
    }

    private static String normalizeSupabaseUrl(String value) {
        try {
            Uri uri = Uri.parse(value == null ? "" : value.trim());
            String host = uri.getHost();
            if (!"https".equals(uri.getScheme()) || host == null || !host.endsWith(".supabase.co")) return "";
            return "https://" + host;
        } catch (Exception ignored) {
            return "";
        }
    }

    private static void clearSessionAndWidgets(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler != null) scheduler.cancel(JOB_ID);
        clearWidgetData(context);
    }

    private static void clearWidgetData(Context context) {
        AgendaWidgetProvider.clearForAccount(context);
        StreakWidgetProvider.clearForAccount(context);
        WorkspaceWidgetProvider.clearForAccount(context);
        PomodoroWidgetProvider.clearForAccount(context);
    }

    private static final class Session {
        final String url;
        final String publicKey;
        final String userId;
        final String accessToken;
        final String refreshToken;
        final long expiresAt;

        Session(
                String url,
                String publicKey,
                String userId,
                String accessToken,
                String refreshToken,
                long expiresAt
        ) {
            this.url = url;
            this.publicKey = publicKey;
            this.userId = userId;
            this.accessToken = accessToken;
            this.refreshToken = refreshToken;
            this.expiresAt = expiresAt;
        }
    }

    private static final class Response {
        final int code;
        final String body;

        Response(int code, String body) {
            this.code = code;
            this.body = body;
        }
    }
}
