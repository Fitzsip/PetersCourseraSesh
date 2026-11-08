package com.fitzsip.flightoverhead;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * Keeps checking for aircraft while the app is closed and posts a notification
 * when one comes over the house. Android requires a visible "watching" notification
 * while this runs.
 */
public class AlertService extends Service {

    static final String PREFS = "flight-overhead";
    private static final String CHANNEL_WATCH = "watching";
    private static final String CHANNEL_ALERTS = "alerts";
    private static final int WATCH_ID = 1;
    private static final long POLL_MS = 15000;
    private static final long RETRY_MS = 60000;
    private static final int FOREGROUND_SERVICE_TYPE_SPECIAL_USE = 0x40000000;

    /** True while the app's own screen is showing; it pops up alerts itself then. */
    static volatile boolean appVisible;

    private HandlerThread thread;
    private Handler handler;
    private PowerManager.WakeLock wakeLock;
    private AlertLogic logic;
    private String logicTables;
    private int sourceIndex;

    private final Runnable pollTask = new Runnable() {
        @Override
        public void run() {
            handler.postDelayed(this, poll() ? POLL_MS : RETRY_MS);
        }
    };

    /** Starts or stops the watcher to match the saved settings. */
    static void sync(Context context) {
        JSONObject cfg = config(context);
        Intent intent = new Intent(context, AlertService.class);
        if (cfg != null && cfg.optBoolean("backgroundAlerts", true) && !cfg.optBoolean("demo")
                && AlertLogic.hasHome(cfg)) {
            context.startForegroundService(intent);
        } else {
            context.stopService(intent);
        }
    }

    static JSONObject config(Context context) {
        try {
            return new JSONObject(context.getSharedPreferences(PREFS, MODE_PRIVATE).getString("config", ""));
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel watch = new NotificationChannel(CHANNEL_WATCH, "Watching the sky",
                NotificationManager.IMPORTANCE_MIN);
        watch.setShowBadge(false);
        nm.createNotificationChannel(watch);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL_ALERTS, "Planes overhead",
                NotificationManager.IMPORTANCE_HIGH));

        Notification n = new Notification.Builder(this, CHANNEL_WATCH)
                .setSmallIcon(icon())
                .setContentTitle("Watching the sky")
                .setContentText("You'll be notified when planes fly over the house")
                .setContentIntent(openApp())
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(WATCH_ID, n, FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(WATCH_ID, n);
        }

        // Keep polling while the screen is off.
        wakeLock = getSystemService(PowerManager.class)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FlightOverhead:watch");
        wakeLock.acquire();
        thread = new HandlerThread("flight-watch");
        thread.start();
        handler = new Handler(thread.getLooper());
        handler.post(pollTask);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(pollTask);
        thread.quitSafely();
        if (wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /** One check. Returns false when the data source could not be reached. */
    private boolean poll() {
        JSONObject cfg = config(this);
        if (cfg == null || !cfg.optBoolean("backgroundAlerts", true) || !AlertLogic.hasHome(cfg)) {
            stopSelf();
            return true;
        }
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String tables = prefs.getString("tables", "{}");
        if (logic == null || !tables.equals(logicTables)) {
            try {
                logic = new AlertLogic(new JSONObject(tables));
            } catch (Exception e) {
                logic = new AlertLogic(null);
            }
            logicTables = tables;
        }

        JSONArray ac = fetch(cfg);
        if (ac == null) return false;
        List<AlertLogic.Alert> alerts = logic.evaluate(ac, cfg, System.currentTimeMillis());
        if (!appVisible) {
            // The app records jets itself while it is open.
            for (JSONObject jet : logic.jetsInZone) JetLog.record(this, jet);
        }
        if (appVisible || AlertLogic.inQuietHours(cfg, Calendar.getInstance())) return true;
        NotificationManager nm = getSystemService(NotificationManager.class);
        for (AlertLogic.Alert a : alerts) {
            Notification.Builder b = new Notification.Builder(this, CHANNEL_ALERTS)
                    .setSmallIcon(icon())
                    .setContentTitle(a.title)
                    .setContentText(a.body.split("\n")[0])
                    .setStyle(new Notification.BigTextStyle().bigText(a.body))
                    .setColor(a.privateJet ? 0xffff7ad9 : 0xffffb547)
                    .setContentIntent(openApp())
                    .setAutoCancel(true);
            if (a.trackingUrl.length() > 0) {
                // Opens the Flightradar24 app if installed, otherwise the website.
                Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(a.trackingUrl))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                PendingIntent track = PendingIntent.getActivity(this, a.hex.hashCode(), view,
                        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                b.addAction(new Notification.Action.Builder(null, "Track on Flightradar24", track).build());
            }
            nm.notify(a.hex.hashCode(), b.build());
        }
        return true;
    }

    // Same free sources as the app's "auto" mode, sticking with whichever answered last.
    private JSONArray fetch(JSONObject cfg) {
        String lat = String.format(Locale.ROOT, "%.4f", cfg.optDouble("homeLat"));
        String lon = String.format(Locale.ROOT, "%.4f", cfg.optDouble("homeLon"));
        long nm = Math.max(1, Math.min(250, (long) Math.ceil(cfg.optDouble("watchRadiusKm", 30) / 1.852)));
        String[] urls = {
                "https://opendata.adsb.fi/api/v2/lat/" + lat + "/lon/" + lon + "/dist/" + nm,
                "https://api.airplanes.live/v2/point/" + lat + "/" + lon + "/" + nm,
                "https://api.adsb.lol/v2/point/" + lat + "/" + lon + "/" + nm
        };
        for (int i = 0; i < urls.length; i++) {
            int idx = (sourceIndex + i) % urls.length;
            try {
                JSONObject data = new JSONObject(get(urls[idx]));
                JSONArray ac = data.optJSONArray("ac");
                if (ac == null) ac = data.optJSONArray("aircraft");
                if (ac != null) {
                    sourceIndex = idx;
                    return ac;
                }
            } catch (Exception e) {
                // try the next source
            }
        }
        return null;
    }

    private static String get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(10000);
        try {
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            InputStream in = c.getInputStream();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
            return buf.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    private int icon() {
        return getResources().getIdentifier("ic_stat_plane", "drawable", getPackageName());
    }

    private PendingIntent openApp() {
        Intent i = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
