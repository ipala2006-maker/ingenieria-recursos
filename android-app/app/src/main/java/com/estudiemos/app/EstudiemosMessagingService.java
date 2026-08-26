package com.estudiemos.app;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class EstudiemosMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        if (!"widget-sync".equals(message.getData().get("type"))) return;
        WidgetSyncManager.syncNow(this);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        WidgetSyncManager.storePushToken(this, token);
    }
}
