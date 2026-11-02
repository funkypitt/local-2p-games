package com.local2p.games;

import android.os.Bundle;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // The WebView keeps running when the screen is locked: tell the page, so it silences its audio.
    private void tellPage(String event) {
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().evaluateJavascript("window.dispatchEvent(new Event('" + event + "'))", null);
        }
    }

    // Full screen: status and navigation bars hidden. A swipe from an edge only shows them for a
    // moment, so sliding a finger along the bottom of the screen (Star Clash, Tennis…) no longer
    // switches to another app.
    private void immersive() {
        Window w = getWindow();
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        immersive();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    @Override
    public void onPause() {
        tellPage("apppause");
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        immersive();
        tellPage("appresume");
    }
}
