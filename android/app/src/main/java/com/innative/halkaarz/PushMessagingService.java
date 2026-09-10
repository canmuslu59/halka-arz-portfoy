package com.innative.halkaarz;

import android.content.Context;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class PushMessagingService extends FirebaseMessagingService {
    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        PushConfigSync.saveToken(this, token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        NotificationHelper.show(this, message.getData());
    }

    static void refreshToken(Context context) {
        try {
            FirebaseApp app = FirebaseApp.initializeApp(context);
            if (app == null && FirebaseApp.getApps(context).isEmpty()) return;
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> PushConfigSync.saveToken(context, token));
        } catch (Exception ignored) {}
    }
}
