package io.github.bemyself001.backlundchronicle;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.view.MotionEvent;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import com.getcapacitor.JSObject;

/** Restore the native focus on a real touch without swallowing WebView input. */
final class InputFocusGuard {
    private final Activity activity;
    private final WebView webView;
    private final boolean enabled;
    private int recoveries;

    @SuppressLint("ClickableViewAccessibility") // Observer only: WebView still handles the entire gesture.
    InputFocusGuard(Activity activity, WebView webView, boolean enabled) {
        this.activity = activity;
        this.webView = webView;
        this.enabled = enabled;
        if (!enabled) return;
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN && !webView.hasFocus()) {
                if (webView.requestFocusFromTouch()) recoveries++;
            }
            return false;
        });
    }

    JSObject info() {
        JSObject result = new JSObject();
        result.put("recoveryEnabled", enabled);
        result.put("recoveries", recoveries);
        result.put("focusable", webView.isFocusable());
        result.put("focusableInTouchMode", webView.isFocusableInTouchMode());
        result.put("viewHasFocus", webView.hasFocus());
        result.put("windowHasFocus", webView.hasWindowFocus());
        result.put("windowFlags", activity.getWindow().getAttributes().flags);
        InputMethodManager ime = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
        result.put("imeActiveForWebView", ime != null && ime.isActive(webView));
        return result;
    }
}
