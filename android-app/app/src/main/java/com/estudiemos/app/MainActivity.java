package com.estudiemos.app;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.DownloadManager;
import android.app.NotificationManager;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.WindowInsets;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;

import java.util.Collections;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://estudiemos-app.vercel.app/";
    private static final String APP_ORIGIN = "https://estudiemos-app.vercel.app";
    private static final String UPDATE_APK_URL = "https://github.com/ipala2006-maker/ingenieria-recursos/releases/download/android-latest/Estudiemos-Android.apk";
    public static final String EXTRA_OPEN_AGENDA = "open_agenda";
    public static final String EXTRA_AGENDA_DATE = "agenda_date";
    public static final String EXTRA_OPEN_POMODORO = "open_pomodoro";
    public static final String EXTRA_WORKSPACE_ITEM_ID = "workspace_item_id";
    public static final String EXTRA_WORKSPACE_ITEM_KIND = "workspace_item_kind";
    public static final String EXTRA_OPEN_DRIVE = "open_drive_workspace";
    public static final String EXTRA_DRIVE_ITEM_ID = "drive_widget_item";
    public static final String EXTRA_DRIVE_ITEM_KIND = "drive_widget_kind";
    public static final String EXTRA_DRIVE_OWNER = "drive_widget_owner";
    private static final int FILE_CHOOSER_REQUEST = 4202;
    private static final int INSTALL_PERMISSION_REQUEST = 4203;

    private WebView webView;
    private boolean openAgendaRequested;
    private String agendaDateRequested;
    private boolean openPomodoroRequested;
    private boolean webReady;
    private ValueCallback<Uri[]> fileChooserCallback;
    private long updateDownloadId = -1L;
    private boolean updateAfterPermission;
    private final Handler updateHandler = new Handler(Looper.getMainLooper());
    private final Runnable updatePoll = this::checkUpdateDownload;
    private boolean updateVisible;
    private String updateState = "idle";
    private int updatePercent = -1;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        openAgendaRequested = getIntent().getBooleanExtra(EXTRA_OPEN_AGENDA, false);
        agendaDateRequested = getIntent().getStringExtra(EXTRA_AGENDA_DATE);
        openPomodoroRequested = getIntent().getBooleanExtra(EXTRA_OPEN_POMODORO, false);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(15, 23, 42));
        FrameLayout rootView = new FrameLayout(this);
        rootView.setBackgroundColor(Color.rgb(15, 23, 42));
        rootView.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(rootView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        updateDownloadId = getSharedPreferences("estudiemos_updates", MODE_PRIVATE).getLong("download_id", -1L);
        updateAfterPermission = savedInstanceState != null && savedInstanceState.getBoolean("update_permission", false);
        applySystemBarInsets(rootView);
        if (StreakReminderReceiver.isEnabled(this)) StreakReminderReceiver.scheduleNext(this);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);

        WebView.setWebContentsDebuggingEnabled(false);
        WebViewCompat.addWebMessageListener(
                webView,
                "EstudiemosAndroid",
                Collections.singleton(APP_ORIGIN),
                this::handleWebMessage
        );

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> callback,
                    WebChromeClient.FileChooserParams fileChooserParams
            ) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                try {
                    Intent chooser = fileChooserParams.createIntent();
                    startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    fileChooserCallback = null;
                    Toast.makeText(MainActivity.this, "No pudimos abrir los archivos del dispositivo.", Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "estudiemos-app.vercel.app".equals(uri.getHost())) {
                    return false;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                webReady = true;
                notifyWebAppReady();
                notifyNativeSessionToWeb();
                sendNotificationStatusToWeb();
                sendInboxNotificationStatus();
                notifyPendingAgendaCompletions();
                notifyPomodoroStateToWeb();
                openAgendaIfRequested();
                openPomodoroIfRequested();
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(initialUrl(getIntent()));
            openDriveItemIfRequested(getIntent());
        }
        else webView.restoreState(savedInstanceState);
    }

    private void applySystemBarInsets(FrameLayout rootView) {
        rootView.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            int left;
            int top;
            int right;
            int bottom;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets systemBars = windowInsets.getInsetsIgnoringVisibility(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                );
                left = systemBars.left;
                top = systemBars.top;
                right = systemBars.right;
                bottom = systemBars.bottom;
            } else {
                left = windowInsets.getSystemWindowInsetLeft();
                top = windowInsets.getSystemWindowInsetTop();
                right = windowInsets.getSystemWindowInsetRight();
                bottom = windowInsets.getSystemWindowInsetBottom();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && windowInsets.getDisplayCutout() != null) {
                    left = Math.max(left, windowInsets.getDisplayCutout().getSafeInsetLeft());
                    top = Math.max(top, windowInsets.getDisplayCutout().getSafeInsetTop());
                    right = Math.max(right, windowInsets.getDisplayCutout().getSafeInsetRight());
                    bottom = Math.max(bottom, windowInsets.getDisplayCutout().getSafeInsetBottom());
                }
            }

            int topBreathingRoom = Math.round(4 * getResources().getDisplayMetrics().density);
            view.setPadding(left, top + topBreathingRoom, right, bottom);
            return windowInsets;
        });
        rootView.requestApplyInsets();
    }

    private void handleWebMessage(
            @NonNull WebView view,
            @NonNull WebMessageCompat message,
            @NonNull Uri sourceOrigin,
            boolean isMainFrame,
            @NonNull JavaScriptReplyProxy replyProxy
    ) {
        if (
                !isMainFrame ||
                !"https".equals(sourceOrigin.getScheme()) ||
                !"estudiemos-app.vercel.app".equals(sourceOrigin.getHost())
        ) return;
        try {
            JSONObject payload = new JSONObject(message.getData());
            String type = payload.optString("type");
            if ("agenda-sync".equals(type)) {
                AgendaWidgetProvider.storeAgendaAndUpdate(this, message.getData());
            } else if ("drive-connect-browser".equals(type)) {
                // Google does not allow OAuth inside embedded WebViews.
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://estudiemos-app.vercel.app/mi-espacio.html")));
            } else if ("inbox-notifications-enable".equals(type)) {
                InboxAlarmReceiver.enable(this);
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4102);
                } else if (!InboxAlarmReceiver.permitted(this)) {
                    startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
                } else requestExactReminderPermissionIfNeeded();
                sendInboxNotificationStatus();
            } else if ("inbox-notifications-status".equals(type)) {
                sendInboxNotificationStatus();
            } else if ("inbox-notifications-settings".equals(type)) {
                AlarmManager alarms = getSystemService(AlarmManager.class);
                if (Build.VERSION.SDK_INT >= 31 && alarms != null && !alarms.canScheduleExactAlarms()) requestExactReminderPermissionIfNeeded();
                else startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
            } else if ("pomodoro-streak-sync".equals(type)) {
                StreakWidgetProvider.storeStreakAndUpdate(this, message.getData());
            } else if ("pomodoro-sync".equals(type)) {
                PomodoroWidgetProvider.storeStateAndUpdate(this, message.getData());
            } else if ("pomodoro-reminder-enable".equals(type)) {
                enableStreakReminder();
            } else if ("pomodoro-notification-status".equals(type)) {
                sendNotificationStatusToWeb();
            } else if ("widget-pin".equals(type)) {
                requestWidgetPin(payload.optString("widget"));
            } else if ("workspace-sync".equals(type)) {
                WorkspaceWidgetProvider.storeWorkspaceAndUpdate(this, message.getData());
            } else if ("drive-workspace-sync".equals(type)) {
                WorkspaceWidgetProvider.storeDriveAndUpdate(this, message.getData());
            } else if ("account-native-sync".equals(type)) {
                WidgetSyncManager.handleAccountMessage(this, payload);
                configureFirebase(payload.optJSONObject("config"));
                sendInboxNotificationStatus();
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('estudiemos-android-widget-account-ready'));", null);
            } else if ("app-update".equals(type)) {
                notifyWebUpdateStarted();
                startAppUpdate();
            }
        } catch (Exception ignored) {
            // Invalid web messages cannot modify native data.
        }
    }

    private void notifyWebAppReady() {
        webView.evaluateJavascript(
                "window.EstudiemosAndroidDriveWidget=" + ReleaseFeatures.DRIVE_WORKSPACE + ";window.EstudiemosAndroidUpdater=true;window.dispatchEvent(new CustomEvent('estudiemos-android-ready'));",
                null
        );
        if (!"idle".equals(updateState)) notifyWebUpdateStatus(updateState, updatePercent);
    }

    private void notifyNativeSessionToWeb() {
        if (!webReady || webView == null) return;
        JSONObject nativeSession = WidgetSyncManager.getSessionForWeb(this);
        if (nativeSession == null) return;
        webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('estudiemos-android-native-session',{detail:" +
                        nativeSession.toString() + "}));",
                null
        );
    }

    private void configureFirebase(JSONObject config) {
        JSONObject firebase = config == null ? null : config.optJSONObject("firebase");
        if (firebase == null) return;
        String apiKey = firebase.optString("apiKey", "").trim();
        String applicationId = firebase.optString("applicationId", "").trim();
        String projectId = firebase.optString("projectId", "").trim();
        String senderId = firebase.optString("senderId", "").trim();
        if (apiKey.isEmpty() || applicationId.isEmpty() || projectId.isEmpty() || senderId.isEmpty()) return;

        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseOptions options = new FirebaseOptions.Builder()
                        .setApiKey(apiKey)
                        .setApplicationId(applicationId)
                        .setProjectId(projectId)
                        .setGcmSenderId(senderId)
                        .build();
                FirebaseApp.initializeApp(this, options);
            }
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null) return;
                String token = task.getResult().trim();
                if (token.isEmpty()) return;
                WidgetSyncManager.storePushToken(this, token);
                if (!webReady || webView == null) return;
                String detail = "{token:" + JSONObject.quote(token) + "}";
                webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('estudiemos-android-push-token',{detail:" + detail + "}));",
                        null
                );
            });
        } catch (Exception ignored) {
            // Periodic widget synchronization remains available if push cannot initialize.
        }
    }

    private void notifyWebUpdateStarted() {
        if (!webReady || webView == null) return;
        webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('estudiemos-android-update-started'));",
                null
        );
    }

    private void notifyWebUpdateStatus(String state, int percent) {
        updateState = state;
        updatePercent = percent;
        if (!webReady || webView == null) return;
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('estudiemos-android-update-status',{detail:{state:"
                + JSONObject.quote(state) + ",percent:" + percent + "}}));", null);
    }

    private void sendNotificationStatusToWeb() {
        if (!webReady || webView == null) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        boolean systemEnabled = manager != null && manager.areNotificationsEnabled();
        boolean permissionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        String permission = systemEnabled && permissionGranted && StreakReminderReceiver.isEnabled(this)
                ? "granted"
                : (!systemEnabled || !permissionGranted) ? "denied" : "default";
        String detail = "{permission:" + JSONObject.quote(permission) + "}";
        webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('estudiemos-android-notification-status',{detail:" + detail + "}));",
                null
        );
    }

    private void sendInboxNotificationStatus() {
        if (!webReady || webView == null) return;
        AlarmManager alarms = getSystemService(AlarmManager.class);
        boolean exact = Build.VERSION.SDK_INT < 31 || (alarms != null && alarms.canScheduleExactAlarms());
        String permission = InboxAlarmReceiver.enabled(this)
                ? (InboxAlarmReceiver.permitted(this) ? "granted" : "denied") : "default";
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('estudiemos-android-inbox-status',{detail:{permission:"
                + JSONObject.quote(permission) + ",exact:" + exact + "}}));", null);
    }

    private void notifyPendingAgendaCompletions() {
        if (!webReady) return;
        for (String itemId : AgendaWidgetProvider.getPendingCompletions(this)) {
            String detail = "{id:" + JSONObject.quote(itemId) + "}";
            webView.evaluateJavascript(
                    "(function sendCompletion(attempt){" +
                            "if(window.__estudiemosAgendaInstalled){" +
                            "window.dispatchEvent(new CustomEvent('estudiemos-android-agenda-complete',{detail:" + detail + "}));" +
                            "return;}" +
                            "if(attempt<40)window.setTimeout(function(){sendCompletion(attempt+1);},50);" +
                            "})(0);",
                    null
            );
        }
    }

    private void notifyPomodoroStateToWeb() {
        if (!webReady || webView == null) return;
        String detail = PomodoroWidgetProvider.getStateForWeb(this);
        webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('estudiemos-android-pomodoro-state',{detail:" + detail + "}));",
                null
        );
    }

    private void openAgendaIfRequested() {
        if (!openAgendaRequested) return;
        openAgendaRequested = false;
        String date = agendaDateRequested;
        agendaDateRequested = null;
        String selectDate = "";
        if (date != null && date.matches("\\d{4}-\\d{2}-\\d{2}")) {
            String selector = "[data-agenda-date=\\\"" + date + "\\\"]";
            selectDate = "window.setTimeout(function(){document.querySelector(" +
                    JSONObject.quote(selector) + ")?.click();},80);";
        }
        webView.evaluateJavascript(
                "document.querySelector('[data-agenda-open]')?.click();" + selectDate,
                null
        );
    }

    private void openPomodoroIfRequested() {
        if (!openPomodoroRequested) return;
        openPomodoroRequested = false;
        webView.evaluateJavascript(
                "document.querySelector('[data-pomodoro-open]')?.click();",
                null
        );
    }

    private void enableStreakReminder() {
        StreakReminderReceiver.setEnabled(this, true);
        if (
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4101);
        } else {
            requestExactReminderPermissionIfNeeded();
            sendNotificationStatusToWeb();
        }
    }

    private void requestExactReminderPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        AlarmManager manager = (AlarmManager) getSystemService(ALARM_SERVICE);
        if (manager == null || manager.canScheduleExactAlarms()) return;
        try {
            startActivity(new Intent(
                    Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:" + getPackageName())
            ));
        } catch (Exception ignored) {}
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 4102) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) requestExactReminderPermissionIfNeeded();
            InboxAlarmReceiver.refresh(this);
            sendInboxNotificationStatus();
        }
        if (requestCode == 4101) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                requestExactReminderPermissionIfNeeded();
            }
            sendNotificationStatusToWeb();
        }
    }

    private void requestWidgetPin(String widget) {
        Class<?> providerClass;
        if ("agenda".equals(widget)) providerClass = AgendaWidgetProvider.class;
        else if ("calendar".equals(widget)) providerClass = CalendarWidgetProvider.class;
        else if ("streak".equals(widget)) providerClass = StreakWidgetProvider.class;
        else if ("pomodoro".equals(widget)) providerClass = PomodoroWidgetProvider.class;
        else if ("workspace".equals(widget)) providerClass = WorkspaceWidgetProvider.class;
        else return;

        AppWidgetManager manager = AppWidgetManager.getInstance(this);
        if (!manager.isRequestPinAppWidgetSupported()) {
            Toast.makeText(this, "Mantené presionada la pantalla de inicio y elegí Widgets.", Toast.LENGTH_LONG).show();
            return;
        }
        manager.requestPinAppWidget(new ComponentName(this, providerClass), null, null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openAgendaRequested = intent.getBooleanExtra(EXTRA_OPEN_AGENDA, false);
        agendaDateRequested = intent.getStringExtra(EXTRA_AGENDA_DATE);
        openPomodoroRequested = intent.getBooleanExtra(EXTRA_OPEN_POMODORO, false);
        String workspaceItemId = intent.getStringExtra(EXTRA_WORKSPACE_ITEM_ID);
        if (intent.getBooleanExtra(EXTRA_OPEN_DRIVE, false)) {
            webView.loadUrl(APP_URL + "mi-espacio.html");
            openDriveItemIfRequested(intent);
        } else if (intent.getData() != null && "estudiemos".equals(intent.getData().getScheme())) {
            webView.loadUrl(referralUrl(intent.getData().getQueryParameter("ref")));
        } else if (workspaceItemId != null && !workspaceItemId.trim().isEmpty()) {
            webView.loadUrl(workspaceUrl(workspaceItemId, intent.getStringExtra(EXTRA_WORKSPACE_ITEM_KIND)));
        }
        openAgendaIfRequested();
        openPomodoroIfRequested();
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateVisible = true;
        InboxAlarmReceiver.refresh(this);
        sendInboxNotificationStatus();
        if (updateAfterPermission) {
            updateAfterPermission = false;
            if (canInstallUpdates()) startAppUpdate();
            else notifyWebUpdateStatus("denied", -1);
        }
        if (updateDownloadId > 0) checkUpdateDownload();
        if (StreakReminderReceiver.isEnabled(this)) StreakReminderReceiver.scheduleNext(this);
        WidgetSyncManager.syncNow(this);
        notifyNativeSessionToWeb();
        notifyPendingAgendaCompletions();
        notifyPomodoroStateToWeb();
        if (webReady && webView != null) {
            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('estudiemos:drive-resume'));", null);
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        webView.saveState(outState);
        outState.putBoolean("update_permission", updateAfterPermission);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onStop() {
        updateVisible = false;
        updateHandler.removeCallbacks(updatePoll);
        super.onStop();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || fileChooserCallback == null) return;
        Uri[] result = resultCode == RESULT_OK ? WebChromeClient.FileChooserParams.parseResult(resultCode, data) : null;
        fileChooserCallback.onReceiveValue(result);
        fileChooserCallback = null;
    }

    private boolean canInstallUpdates() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls();
    }

    private void startAppUpdate() {
        if (updateDownloadId > 0) {
            checkUpdateDownload();
            return;
        }
        if (!canInstallUpdates()) {
            updateAfterPermission = true;
            notifyWebUpdateStatus("permission", -1);
            Toast.makeText(this, "Permití que Estudiemos instale su actualización. Solo se solicita una vez.", Toast.LENGTH_LONG).show();
            Intent settingsIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName())
            );
            try {
                startActivityForResult(settingsIntent, INSTALL_PERMISSION_REQUEST);
            } catch (Exception error) {
                updateAfterPermission = false;
                notifyWebUpdateStatus("error", -1);
            }
            return;
        }

        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (manager == null) {
            notifyWebUpdateStatus("error", -1);
            Toast.makeText(this, "No pudimos iniciar la actualización.", Toast.LENGTH_LONG).show();
            return;
        }
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(UPDATE_APK_URL))
                    .setTitle("Actualizando Estudiemos")
                    .setDescription("Descargando la versión más reciente")
                    .setMimeType("application/vnd.android.package-archive")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(false)
                    .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "Estudiemos-actualizacion.apk");
            java.io.File previous = new java.io.File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Estudiemos-actualizacion.apk");
            if (previous.exists() && !previous.delete()) throw new java.io.IOException("Previous update is unavailable");
            updateDownloadId = manager.enqueue(request);
            getSharedPreferences("estudiemos_updates", MODE_PRIVATE).edit().putLong("download_id", updateDownloadId).apply();
            notifyWebUpdateStatus("downloading", -1);
            checkUpdateDownload();
            Toast.makeText(this, "Descargando la actualización dentro de Estudiemos...", Toast.LENGTH_LONG).show();
        } catch (Exception error) {
            clearUpdateDownload();
            notifyWebUpdateStatus("error", -1);
            Toast.makeText(this, "No pudimos descargar la actualización. Revisá tu conexión.", Toast.LENGTH_LONG).show();
        }
    }

    private void clearUpdateDownload() {
        updateHandler.removeCallbacks(updatePoll);
        updateDownloadId = -1L;
        getSharedPreferences("estudiemos_updates", MODE_PRIVATE).edit().remove("download_id").apply();
    }

    private void checkUpdateDownload() {
        updateHandler.removeCallbacks(updatePoll);
        if (!updateVisible || updateDownloadId <= 0) return;
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (manager == null) {
            clearUpdateDownload();
            notifyWebUpdateStatus("error", -1);
            return;
        }
        // Query our saved download, including after rotation or a missed system broadcast.
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(updateDownloadId))) {
            if (cursor == null || !cursor.moveToFirst()) throw new java.io.IOException("Update download missing");
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                openDownloadedUpdate(updateDownloadId);
                return;
            }
            if (status == DownloadManager.STATUS_FAILED) throw new java.io.IOException("Update download failed");
            long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            long bytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            int percent = total > 0 ? (int) Math.max(0, Math.min(99, bytes * 100d / total)) : -1;
            notifyWebUpdateStatus(status == DownloadManager.STATUS_PAUSED ? "waiting" : "downloading", percent);
            updateHandler.postDelayed(updatePoll, 1000);
        } catch (Exception error) {
            clearUpdateDownload();
            notifyWebUpdateStatus("error", -1);
        }
    }

    private void openDownloadedUpdate(long downloadId) {
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        Uri apkUri = manager == null ? null : manager.getUriForDownloadedFile(downloadId);
        if (apkUri == null) {
            clearUpdateDownload();
            notifyWebUpdateStatus("error", -1);
            Toast.makeText(this, "La descarga no pudo completarse.", Toast.LENGTH_LONG).show();
            return;
        }
        Intent installIntent = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(apkUri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(installIntent);
            clearUpdateDownload();
            notifyWebUpdateStatus("installer", 100);
        } catch (Exception error) {
            clearUpdateDownload();
            notifyWebUpdateStatus("error", -1);
            Toast.makeText(this, "Android no pudo abrir el instalador de la actualización.", Toast.LENGTH_LONG).show();
        }
    }

    private static String initialUrl(Intent intent) {
        if (intent == null) return APP_URL;
        if (intent.getBooleanExtra(EXTRA_OPEN_DRIVE, false)) return APP_URL + "mi-espacio.html";
        Uri data = intent.getData();
        if (data != null && "estudiemos".equals(data.getScheme())) {
            return referralUrl(data.getQueryParameter("ref"));
        }
        String itemId = intent.getStringExtra(EXTRA_WORKSPACE_ITEM_ID);
        if (itemId == null || itemId.trim().isEmpty()) return APP_URL;
        return workspaceUrl(itemId, intent.getStringExtra(EXTRA_WORKSPACE_ITEM_KIND));
    }

    private static String referralUrl(String code) {
        if (code == null) return APP_URL;
        String normalized = code.toUpperCase().replaceAll("[^A-Z0-9]", "");
        if (normalized.length() < 8) return APP_URL;
        if (normalized.length() > 12) normalized = normalized.substring(0, 12);
        return Uri.parse(APP_URL).buildUpon().appendQueryParameter("ref", normalized).build().toString();
    }

    private static String workspaceUrl(String itemId, String kind) {
        return Uri.parse(APP_URL).buildUpon()
                .appendQueryParameter("workspaceItem", itemId == null ? "" : itemId)
                .appendQueryParameter("workspaceKind", "file".equals(kind) ? "file" : "folder")
                .build()
                .toString();
    }

    private void openDriveItemIfRequested(Intent intent) {
        if (intent == null || !ReleaseFeatures.DRIVE_WORKSPACE || !intent.getBooleanExtra(EXTRA_OPEN_DRIVE, false)
                || !DriveWidgetRules.belongsTo(intent.getStringExtra(EXTRA_DRIVE_OWNER), WidgetSyncManager.currentUserId(this))) return;
        String target = DriveWidgetRules.openUrl(intent.getStringExtra(EXTRA_DRIVE_ITEM_ID), intent.getStringExtra(EXTRA_DRIVE_ITEM_KIND));
        if (target.isEmpty()) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(target)));
        } catch (Exception error) {
            Toast.makeText(this, "No pudimos abrir Google Drive.", Toast.LENGTH_SHORT).show();
        }
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        updateHandler.removeCallbacks(updatePoll);
        if (fileChooserCallback != null) {
            fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = null;
        }
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
