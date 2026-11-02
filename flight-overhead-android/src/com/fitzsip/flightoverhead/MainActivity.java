package com.fitzsip.flightoverhead;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Shows the same app as the TV (bundled in assets/www) in a full-screen WebView. */
public class MainActivity extends Activity {

    private static final int REQUEST_NOTIFICATIONS = 1;
    private static final int REQUEST_LOCATION = 2;

    private WebView web;
    private GeolocationPermissions.Callback pendingGeo;
    private String pendingGeoOrigin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(0xff070d18);
        getWindow().setNavigationBarColor(0xff070d18);

        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        // Lets the bundled page call the flight APIs (and FlightAware) without CORS limits.
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setGeolocationEnabled(true);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                    return;
                }
                pendingGeo = callback;
                pendingGeoOrigin = origin;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION}, REQUEST_LOCATION);
            }
        });
        web.loadUrl("file:///android_asset/www/index.html?platform=android");

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQUEST_NOTIFICATIONS);
        }
        AlertService.sync(this);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == REQUEST_LOCATION && pendingGeo != null) {
            boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            pendingGeo.invoke(pendingGeoOrigin, granted, false);
            pendingGeo = null;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        AlertService.appVisible = true;
        web.onResume();
    }

    @Override
    protected void onPause() {
        AlertService.appVisible = false;
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        AlertService.appVisible = false;
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // Let the page close settings, popups or the selection first.
        web.evaluateJavascript("window.appBack ? window.appBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) finish();
            }
        });
    }

    /** Called from the page's JavaScript. */
    private class Bridge {
        @JavascriptInterface
        public void saveConfig(String json) {
            getSharedPreferences(AlertService.PREFS, MODE_PRIVATE).edit().putString("config", json).apply();
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    AlertService.sync(MainActivity.this);
                }
            });
        }

        @JavascriptInterface
        public void setTables(String json) {
            getSharedPreferences(AlertService.PREFS, MODE_PRIVATE).edit().putString("tables", json).apply();
        }

        @JavascriptInterface
        public void exit() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }
    }
}
