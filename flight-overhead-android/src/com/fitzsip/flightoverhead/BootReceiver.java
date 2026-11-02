package com.fitzsip.flightoverhead;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restarts the background watcher after a reboot or an app update. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            AlertService.sync(context);
        } catch (Exception e) {
            // Android may refuse to start it here; it starts again when the app is opened.
        }
    }
}
