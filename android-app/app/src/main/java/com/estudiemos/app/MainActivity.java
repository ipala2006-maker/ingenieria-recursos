package com.estudiemos.app;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;

import java.util.Collections;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://estudiemos-app.vercel.app/";
    private static final String APP_ORIGIN = "https://estudiemos-app.vercel.app";
    public static final String EXTRA_OPEN_AGENDA = "open_agenda";
    public static final String EXTRA_AGENDA_DATE = "agenda_date";
    public static final String EXTRA_OPEN_POMODORO = "open_pomodoro";

    private WebView webView;
    private boolean openAgendaRequested;
    private String agendaDateRequested;
    private boolean openPomodoroRequested;
    private boolean webReady;

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
        applySystemBarInsets(rootView);
        if (StreakReminderReceiver.isEnabled(this)) StreakReminderReceiver.scheduleNext(this);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);

        WebView.setWebContentsDebuggingEnabled(false);
        WebViewCompat.addWebMessageListener(
                webView,
                "EstudiemosAndroid",
                Collections.singleton(APP_ORIGIN),
                this::handleWebMessage
        );

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
                sendNotificationStatusToWeb();
                notifyPendingAgendaCompletions();
                openAgendaIfRequested();
                openPomodoroIfRequested();
            }
        });

        if (savedInstanceState == null) webView.loadUrl(APP_URL);
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
            } else if ("pomodoro-streak-sync".equals(type)) {
                StreakWidgetProvider.storeStreakAndUpdate(this, message.getData());
            } else if ("pomodoro-reminder-enable".equals(type)) {
                enableStreakReminder();
            } else if ("pomodoro-notification-status".equals(type)) {
                sendNotificationStatusToWeb();
            } else if ("widget-pin".equals(type)) {
                requestWidgetPin(payload.optString("widget"));
            }
        } catch (Exception ignored) {
            // Invalid web messages cannot modify native data.
        }
    }

    private void notifyWebAppReady() {
        webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('estudiemos-android-ready'));",
                null
        );
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
            sendNotificationStatusToWeb();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 4101) sendNotificationStatusToWeb();
    }

    private void requestWidgetPin(String widget) {
        Class<?> providerClass;
        if ("agenda".equals(widget)) providerClass = AgendaWidgetProvider.class;
        else if ("calendar".equals(widget)) providerClass = CalendarWidgetProvider.class;
        else if ("streak".equals(widget)) providerClass = StreakWidgetProvider.class;
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
        openAgendaIfRequested();
        openPomodoroIfRequested();
    }

    @Override
    protected void onResume() {
        super.onResume();
        notifyPendingAgendaCompletions();
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
