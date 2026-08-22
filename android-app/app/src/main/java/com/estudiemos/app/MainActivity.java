package com.estudiemos.app;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Activity;
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
                notifyWebAppReady();
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
                android.graphics.Insets systemBars = windowInsets.getInsets(
                        WindowInsets.Type.systemBars()
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
            }

            view.setPadding(left, top, right, bottom);
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
            String type = new JSONObject(message.getData()).optString("type");
            if ("agenda-sync".equals(type)) {
                AgendaWidgetProvider.storeAgendaAndUpdate(this, message.getData());
            } else if ("pomodoro-streak-sync".equals(type)) {
                StreakWidgetProvider.storeStreakAndUpdate(this, message.getData());
            } else if ("pomodoro-reminder-enable".equals(type)) {
                enableStreakReminder();
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
        }
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
