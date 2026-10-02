package io.github.bemyself001.backlundchronicle;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.widget.TextView;
import com.getcapacitor.JSObject;
import com.getcapacitor.WebViewListener;
import java.util.ArrayList;
import java.util.List;

/** In-memory startup metadata only; no URLs, exception messages, save data or credentials. */
final class StartupDiagnostics extends WebViewListener {
    private final Activity activity;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<String> stages = new ArrayList<>();
    private final long started = android.os.SystemClock.elapsedRealtime();
    private boolean ready;
    private AlertDialog dialog;
    private final Runnable timeout = () -> showFailure("首屏等待超过 20 秒");

    StartupDiagnostics(Activity activity) { this.activity = activity; }

    void start() {
        mark("Activity 启动");
        handler.postDelayed(timeout, 20000);
    }

    void mark(String stage) {
        String entry = (android.os.SystemClock.elapsedRealtime() - started) + "ms " + stage;
        if (stages.size() < 40) stages.add(entry);
        Log.i("BacklundStartup", entry);
    }

    JSObject info() {
        JSObject result = new JSObject();
        result.put("model", Build.MODEL);
        result.put("android", Build.VERSION.RELEASE);
        result.put("sdk", Build.VERSION.SDK_INT);
        result.put("variant", BuildConfig.STARTUP_VARIANT);
        result.put("nativeVersion", BuildConfig.VERSION_NAME);
        result.put("nativeCode", BuildConfig.VERSION_CODE);
        InputFocusGuard inputFocus = ((MainActivity) activity).inputFocus;
        if (inputFocus != null) result.put("inputFocus", inputFocus.info());
        result.put("nativeStages", stages.toString());
        try {
            PackageInfo provider = Build.VERSION.SDK_INT >= 26 ? WebView.getCurrentWebViewPackage() : null;
            result.put("webViewPackage", provider == null ? "unavailable" : provider.packageName);
            result.put("webViewVersion", provider == null ? "unavailable" : provider.versionName);
        } catch (Exception error) {
            result.put("webViewVersion", "unavailable");
        }
        return result;
    }

    void ready() {
        if (ready) return;
        ready = true;
        mark("网页首屏确认");
        handler.removeCallbacks(timeout);
        if (dialog != null) dialog.dismiss();
    }

    void showFailure(String stage) {
        mark(stage);
        handler.removeCallbacks(timeout);
        if (activity.isFinishing() || activity.isDestroyed() || dialog != null) return;
        final String report = info().toString();
        TextView text = new TextView(activity);
        text.setText("游戏尚未完成启动。请复制以下信息反馈给作者。\n\n" + report);
        text.setTextIsSelectable(true);
        int padding = (int) (20 * activity.getResources().getDisplayMetrics().density);
        text.setPadding(padding, padding, padding, padding);
        android.widget.ScrollView scroll = new android.widget.ScrollView(activity);
        scroll.addView(text);
        dialog = new AlertDialog.Builder(activity).setTitle("贝克兰德纪事 · 启动诊断")
            .setView(scroll).setPositiveButton("复制诊断", null)
            .setNeutralButton("重新启动", (d, which) -> activity.recreate())
            .setNegativeButton("关闭", (d, which) -> {}).create();
        dialog.show();
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("启动诊断", report));
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setText("已复制");
        });
    }

    void destroy() {
        handler.removeCallbacks(timeout);
        if (dialog != null) dialog.dismiss();
    }

    @Override public void onPageStarted(WebView view) { mark("入口页面开始加载"); }
    @Override public void onPageLoaded(WebView view) { mark("页面加载结束（不代表游戏就绪）"); }
    @Override public void onPageCommitVisible(WebView view, String url) { mark("页面首次可见"); }
    @Override public void onReceivedError(WebView view) { if (!ready) mark("页面或子资源加载错误"); }
    @Override public void onReceivedHttpError(WebView view) { if (!ready) mark("页面或子资源 HTTP 错误"); }
    @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
        view.destroy();
        showFailure(detail.didCrash() ? "WebView 渲染进程崩溃" : "WebView 渲染进程被系统终止");
        return true;
    }
}
