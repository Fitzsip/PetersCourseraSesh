package com.fitzsip.flightoverhead;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Private jets seen in the last 24 hours. Shared by the background watcher and the
 * app's "Jets (24h)" list (js/jetlog.js), which reads and writes it through the bridge.
 */
final class JetLog {
    private static final String KEY = "jetLog";
    private static final long KEEP_MS = 24L * 3600 * 1000;
    private static final Object LOCK = new Object();

    private JetLog() {
    }

    /** Adds the jet, or updates it if it was already seen in the last 24 hours. */
    static void record(Context context, JSONObject entry) {
        synchronized (LOCK) {
            JSONArray old = read(context);
            JSONArray out = new JSONArray();
            String hex = entry.optString("hex");
            for (int i = 0; i < old.length(); i++) {
                JSONObject e = old.optJSONObject(i);
                if (e == null) continue;
                if (!hex.equals(e.optString("hex"))) {
                    out.put(e);
                    continue;
                }
                try {
                    entry.put("firstSeen", e.optLong("firstSeen", entry.optLong("firstSeen")));
                    if (e.optDouble("closestKm", Double.MAX_VALUE) < entry.optDouble("closestKm", Double.MAX_VALUE)) {
                        entry.put("closestKm", e.optDouble("closestKm"));
                        entry.put("altFt", e.opt("altFt"));
                    }
                } catch (Exception ignored) {
                    // keep the new values
                }
            }
            out.put(entry);
            prefs(context).edit().putString(KEY, out.toString()).apply();
        }
    }

    /** The entries from the last 24 hours, oldest first. */
    static JSONArray read(Context context) {
        synchronized (LOCK) {
            JSONArray out = new JSONArray();
            try {
                JSONArray all = new JSONArray(prefs(context).getString(KEY, "[]"));
                long cutoff = System.currentTimeMillis() - KEEP_MS;
                for (int i = 0; i < all.length(); i++) {
                    JSONObject e = all.optJSONObject(i);
                    if (e != null && e.optLong("lastSeen") >= cutoff) out.put(e);
                }
            } catch (Exception ignored) {
                // start afresh
            }
            return out;
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(AlertService.PREFS, Context.MODE_PRIVATE);
    }
}
