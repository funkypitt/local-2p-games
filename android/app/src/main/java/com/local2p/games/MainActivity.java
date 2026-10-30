package com.local2p.games;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // The WebView keeps running when the screen is locked: tell the page, so it silences its audio.
    private void tellPage(String event) {
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().evaluateJavascript("window.dispatchEvent(new Event('" + event + "'))", null);
        }
    }

    @Override
    public void onPause() {
        tellPage("apppause");
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        tellPage("appresume");
    }
}
