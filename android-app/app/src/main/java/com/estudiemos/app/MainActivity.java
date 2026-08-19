package com.estudiemos.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;

import java.util.Collections;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://estudiemos-app.vercel.app/";
    private static final String APP_ORIGIN = "https://estudiemos-app.vercel.app";
    public static final String EXTRA_OPEN_AGENDA = "open_agenda";

    private WebView webView;
    private boolean openAgendaRequested;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        openAgendaRequested = getIntent().getBooleanExtra(EXTRA_OPEN_AGENDA, false);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(15, 23, 42));
        setContentView(webView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

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
            }
        });

        if (savedInstanceState == null) webView.loadUrl(APP_URL);
        else webView.restoreState(savedInstanceState);
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
        AgendaWidgetProvider.storeAgendaAndUpdate(this, message.getData());
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
        webView.evaluateJavascript(
                "document.querySelector('[data-agenda-open]')?.click();",
                null
        );
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openAgendaRequested = intent.getBooleanExtra(EXTRA_OPEN_AGENDA, false);
        openAgendaIfRequested();
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
