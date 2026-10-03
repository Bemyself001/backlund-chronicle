package io.github.bemyself001.backlundchronicle;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import java.util.function.Consumer;

/** Restore the native focus on a real touch without swallowing WebView input. */
final class InputFocusGuard {
    private final Activity activity;
    private final WebView webView;
    private final boolean enabled;
    private final int webViewMajor;
    private int recoveries;
    private int focusResets;
    private int inputRestarts;
    private long interaction;
    private long lastTouch = -10000;
    private long lastReset = -10000;
    private boolean pending;
    private boolean destroyed;

    @SuppressLint("ClickableViewAccessibility") // Observer only: WebView still handles the entire gesture.
    InputFocusGuard(Activity activity, WebView webView, boolean enabled) {
        this.activity = activity;
        this.webView = webView;
        this.enabled = enabled;
        int major = 0;
        try {
            PackageInfo provider = Build.VERSION.SDK_INT >= 26 ? WebView.getCurrentWebViewPackage() : null;
            if (provider != null) major = Integer.parseInt(provider.versionName.split("\\.")[0]);
        } catch (RuntimeException ignored) { /* Unknown engines do not receive the workaround. */ }
        this.webViewMajor = major;
        if (!enabled) return;
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                interaction++;
                lastTouch = SystemClock.uptimeMillis();
                if (!webView.hasFocus() && webView.requestFocusFromTouch()) recoveries++;
            }
            return false;
        });
    }

    private boolean active() {
        return !destroyed && !activity.isFinishing() && !activity.isDestroyed()
            && webView.isAttachedToWindow() && webView.isShown() && webView.hasWindowFocus();
    }

    private JSObject result(String status, boolean attempted, boolean restarted) {
        JSObject result = new JSObject();
        result.put("status", status);
        result.put("attempted", attempted);
        result.put("restarted", restarted);
        return result;
    }

    /** Repair only a fresh tap with a confirmed DOM/native focus mismatch on the affected engines. */
    void recover(int requestId, Consumer<JSObject> complete) {
        if (!enabled || webViewMajor <= 0 || webViewMajor >= 84) {
            complete.accept(result("unsupported", false, false));
            return;
        }
        if (!active()) { complete.accept(result("inactive", false, false)); return; }
        if (requestId <= 0 || SystemClock.uptimeMillis() - lastTouch > 1500) {
            complete.accept(result("stale", false, false));
            return;
        }
        if (pending) { complete.accept(result("busy", false, false)); return; }
        if (SystemClock.uptimeMillis() - lastReset < 1000) {
            complete.accept(result("throttled", false, false));
            return;
        }
        pending = true;
        final long tap = interaction;
        final boolean[] settled = { false };
        Consumer<JSObject> finish = response -> {
            if (settled[0]) return;
            settled[0] = true;
            pending = false;
            complete.accept(response);
        };
        // A timeout only resolves the request; it never moves focus later.
        Runnable timeout = () -> finish.accept(result("timeout", false, false));
        webView.postDelayed(timeout, 1500);
        try {
            webView.evaluateJavascript("Boolean(window.__startupInputRecovery && window.__startupInputRecovery.check("
                + requestId + "))", value -> {
                if (settled[0]) return;
                webView.removeCallbacks(timeout);
                if (!active()) { finish.accept(result("inactive", false, false)); return; }
                if (interaction != tap || SystemClock.uptimeMillis() - lastTouch > 1500 || !"true".equals(value)) {
                    finish.accept(result("stale", false, false));
                    return;
                }
                lastReset = SystemClock.uptimeMillis();
                boolean restarted = false;
                try {
                    // hasFocus() can be true while Blink still considers its page unfocused.
                    // A real focus transition re-notifies WebView; requestFocus alone is then a no-op.
                    webView.clearFocus();
                    boolean focused = webView.requestFocusFromTouch();
                    focusResets++;
                    InputMethodManager ime = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
                    if (focused && active() && ime != null) {
                        ime.restartInput(webView);
                        inputRestarts++;
                        restarted = true;
                    }
                    finish.accept(result(focused ? "reset" : "failed", true, restarted));
                } catch (RuntimeException ignored) {
                    finish.accept(result("failed", true, restarted));
                }
            });
        } catch (RuntimeException ignored) {
            webView.removeCallbacks(timeout);
            finish.accept(result("failed", false, false));
        }
    }

    void cancelPending() { interaction++; }

    void destroy() {
        destroyed = true;
        cancelPending();
        if (enabled) webView.setOnTouchListener(null);
    }

    JSObject info() {
        JSObject result = new JSObject();
        result.put("recoveryEnabled", enabled);
        result.put("recoveries", recoveries);
        result.put("webViewMajor", webViewMajor);
        result.put("mismatchRecoveryEnabled", enabled && webViewMajor > 0 && webViewMajor < 84);
        result.put("focusResets", focusResets);
        result.put("inputRestarts", inputRestarts);
        result.put("focusable", webView.isFocusable());
        result.put("focusableInTouchMode", webView.isFocusableInTouchMode());
        result.put("viewHasFocus", webView.hasFocus());
        result.put("windowHasFocus", webView.hasWindowFocus());
        result.put("windowFlags", activity.getWindow().getAttributes().flags);
        InputMethodManager ime = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
        result.put("imeActiveForWebView", ime != null && ime.isActive(webView));
        result.put("imeAcceptingText", ime != null && ime.isActive(webView) && ime.isAcceptingText());
        return result;
    }
}
