package com.fitzsip.flightoverhead;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Decides which aircraft deserve a phone notification while the app is closed.
 * Mirrors js/tracker.js and classifyAircraft() in js/data.js; the lookup tables
 * come from the web app so both sides agree on what a private jet is.
 */
final class AlertLogic {

    static final class Alert {
        final String hex;
        final String title;
        final String body;
        final boolean privateJet;
        /** Flightradar24 page for the flight, or "" if there is nothing to look it up by. */
        final String trackingUrl;

        Alert(String hex, String title, String body, boolean privateJet, String trackingUrl) {
            this.hex = hex;
            this.title = title;
            this.body = body;
            this.privateJet = privateJet;
            this.trackingUrl = trackingUrl;
        }
    }

    private static final double KM_PER_DEG = Math.PI * 6371.0088 / 180;
    private static final String[] POINTS = {"N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"};

    private final Set<String> bizjetTypes = new HashSet<String>();
    private final Set<String> airlinerTypes = new HashSet<String>();
    private final Map<String, String> operators = new HashMap<String, String>();
    private final Map<String, String> typeNames = new HashMap<String, String>();
    private final Map<String, String> airlines = new HashMap<String, String>();
    private final Map<String, Long> lastInZone = new HashMap<String, Long>();

    AlertLogic(JSONObject tables) {
        if (tables == null) return;
        addAll(bizjetTypes, tables.optJSONArray("bizjetTypes"));
        addAll(airlinerTypes, tables.optJSONArray("airlinerTypes"));
        putAll(operators, tables.optJSONObject("operators"));
        putAll(typeNames, tables.optJSONObject("typeNames"));
        putAll(airlines, tables.optJSONObject("airlines"));
    }

    private static void addAll(Set<String> set, JSONArray arr) {
        for (int i = 0; arr != null && i < arr.length(); i++) set.add(arr.optString(i));
    }

    private static void putAll(Map<String, String> map, JSONObject obj) {
        if (obj == null) return;
        Iterator<String> keys = obj.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            map.put(k, obj.optString(k));
        }
    }

    static boolean hasHome(JSONObject cfg) {
        return cfg != null && !cfg.isNull("homeLat") && !cfg.isNull("homeLon")
                && !Double.isNaN(cfg.optDouble("homeLat")) && !Double.isNaN(cfg.optDouble("homeLon"));
    }

    static boolean inQuietHours(JSONObject cfg, Calendar now) {
        if (!cfg.optBoolean("quietHours", true)) return false;
        int h = now.get(Calendar.HOUR_OF_DAY);
        return h >= 22 || h < 8;
    }

    private boolean isPrivateJet(String callsign, String type, String reg) {
        String prefix = callsign.matches("^[A-Z]{3}\\d.*") ? callsign.substring(0, 3) : "";
        if (operators.containsKey(prefix)) return true;
        if (bizjetTypes.contains(type)) return true;
        String r = reg.replace("-", "");
        return airlinerTypes.contains(type) && r.length() > 0 && callsign.replace("-", "").equals(r);
    }

    /** Private jets in the alert zone during the last evaluate(), for the 24-hour list. */
    final List<JSONObject> jetsInZone = new ArrayList<JSONObject>();

    /** Returns the aircraft (from a readsb "ac" array) that should be announced now. */
    List<Alert> evaluate(JSONArray ac, JSONObject cfg, long now) {
        List<Alert> out = new ArrayList<Alert>();
        jetsInZone.clear();
        double homeLat = cfg.optDouble("homeLat"), homeLon = cfg.optDouble("homeLon");
        double radius = cfg.optDouble("alertRadiusKm", 2.5);
        double jetRadius = Math.max(radius, cfg.optDouble("jetAlertRadiusKm", 10));
        double maxAlt = cfg.optDouble("maxAltitudeFt", 20000);
        double lookahead = cfg.optDouble("lookaheadSeconds", 30);
        long cooldownMs = (long) (cfg.optDouble("cooldownMinutes", 20) * 60000);
        boolean jetsOnly = !"all alerts".equals(cfg.optString("notifyFor", "private jets"));

        for (int i = 0; ac != null && i < ac.length(); i++) {
            JSONObject a = ac.optJSONObject(i);
            if (a == null || a.isNull("lat") || a.isNull("lon")) continue;
            String hex = a.optString("hex", "").replace("~", "");
            String callsign = a.optString("flight", "").trim();
            String reg = a.optString("r", "");
            String type = a.optString("t", "");
            boolean onGround = "ground".equals(a.optString("alt_baro"));
            double alt = a.optDouble("alt_baro", a.optDouble("alt_geom", Double.NaN));
            double gs = a.optDouble("gs", Double.NaN);
            double track = a.optDouble("track", a.optDouble("true_heading", Double.NaN));
            double age = a.optDouble("seen_pos", 0);

            double dLon = a.optDouble("lon") - homeLon;
            if (dLon > 180) dLon -= 360;
            if (dLon < -180) dLon += 360;
            double x = dLon * KM_PER_DEG * Math.cos(Math.toRadians(homeLat));
            double y = (a.optDouble("lat") - homeLat) * KM_PER_DEG;
            boolean hasVelocity = !Double.isNaN(gs) && !Double.isNaN(track) && gs > 0;
            double vx = 0, vy = 0;
            if (hasVelocity) {
                double v = gs * 1.852 / 3600;
                vx = Math.sin(Math.toRadians(track)) * v;
                vy = Math.cos(Math.toRadians(track)) * v;
            }
            x += vx * age;
            y += vy * age;
            double dist = Math.hypot(x, y);
            double v2 = vx * vx + vy * vy;
            double cpaSec = v2 > 0 ? Math.max(0, -(x * vx + y * vy) / v2) : 0;
            double cpaKm = Math.hypot(x + vx * cpaSec, y + vy * cpaSec);

            boolean jet = isPrivateJet(callsign, type, reg);
            boolean altOk = !onGround && (jet || Double.isNaN(alt) || alt <= maxAlt);
            boolean willPass = hasVelocity && cpaKm <= radius && cpaSec > 0;
            boolean overheadNow = altOk && dist <= radius;
            boolean inZone = overheadNow
                    || (altOk && willPass && cpaSec <= lookahead)
                    || (altOk && jet && dist <= jetRadius);
            if (!inZone) continue;

            String typeName = typeNames.containsKey(type) ? typeNames.get(type) : a.optString("desc", type);
            if (jet) {
                // Same fields as js/jetlog.js.
                JSONObject entry = new JSONObject();
                try {
                    entry.put("hex", hex).put("callsign", callsign).put("reg", reg).put("type", typeName)
                            .put("operator", a.optString("ownOp", ""))
                            .put("closestKm", Math.round(dist * 10) / 10.0)
                            .put("altFt", Double.isNaN(alt) ? JSONObject.NULL : (Object) alt)
                            .put("firstSeen", now).put("lastSeen", now);
                } catch (Exception ignored) {
                    // never thrown for these values
                }
                jetsInZone.add(entry);
            }

            Long last = lastInZone.get(hex);
            lastInZone.put(hex, now);
            if ((last != null && now - last <= cooldownMs) || (jetsOnly && !jet)) continue;

            String title = (jet ? "Private jet" : "Flight") + (overheadNow ? " overhead" : " approaching") + " ✈️";
            StringBuilder body = new StringBuilder();
            String name = callsign.length() > 0 ? callsign : reg.length() > 0 ? reg : hex.toUpperCase(Locale.ROOT);
            body.append(name);
            String airline = callsign.matches("^[A-Z]{3}\\d.*") ? airlines.get(callsign.substring(0, 3)) : null;
            if (airline != null) body.append(" · ").append(airline);
            if (typeName.length() > 0) body.append(" · ").append(typeName);
            if (reg.length() > 0 && !reg.equals(callsign)) body.append(" · ").append(reg);
            body.append('\n').append(dist(dist, cfg)).append(' ').append(compass(Math.toDegrees(Math.atan2(x, y))))
                    .append(" of ").append(cfg.optString("homeName", "home"));
            if (!Double.isNaN(alt)) body.append(", ").append(altitude(alt, cfg));
            if (overheadNow) body.append(", overhead now");
            else if (willPass && cpaSec <= 900) body.append(", over the house in ~").append(eta(cpaSec));
            out.add(new Alert(hex, title, body.toString(), jet, trackingUrl(callsign, reg)));
        }

        Iterator<Map.Entry<String, Long>> it = lastInZone.entrySet().iterator();
        while (it.hasNext()) {
            if (now - it.next().getValue() > cooldownMs) it.remove();
        }
        return out;
    }

    /** Same as trackingUrl() in js/data.js. */
    static String trackingUrl(String callsign, String reg) {
        try {
            if (callsign.length() > 0) return "https://www.flightradar24.com/" + java.net.URLEncoder.encode(callsign, "UTF-8");
            if (reg.length() > 0) {
                return "https://www.flightradar24.com/data/aircraft/"
                        + java.net.URLEncoder.encode(reg.toLowerCase(Locale.ROOT), "UTF-8");
            }
        } catch (java.io.UnsupportedEncodingException e) {
            // UTF-8 is always available
        }
        return "";
    }

    static String compass(double deg) {
        return POINTS[(int) Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
    }

    static String dist(double km, JSONObject cfg) {
        boolean metric = !"imperial".equals(cfg.optString("units", "metric"));
        double v = metric ? km : km * 0.621371;
        String n = v < 10 ? String.format(Locale.ROOT, "%.1f", v) : String.valueOf(Math.round(v));
        return n + (metric ? " km" : " mi");
    }

    static String altitude(double ft, JSONObject cfg) {
        boolean metric = !"imperial".equals(cfg.optString("units", "metric"));
        return String.format(Locale.UK, "%,d", Math.round(metric ? ft * 0.3048 : ft)) + (metric ? " m" : " ft");
    }

    static String eta(double s) {
        if (s < 60) return Math.max(5, Math.round(s / 5) * 5) + "s";
        long m = (long) Math.floor(s / 60);
        long r = Math.min(50, Math.round((s % 60) / 10) * 10);
        return m + "m" + (r > 0 ? " " + r + "s" : "");
    }
}
