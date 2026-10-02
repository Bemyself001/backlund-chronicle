package io.github.bemyself001.backlundchronicle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.ServerPath;

import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;

public class MainActivity extends BridgeActivity {
    final StartupDiagnostics startupDiagnostics = new StartupDiagnostics(this);
    InputFocusGuard inputFocus;
    private final Handler startupHandler = new Handler(Looper.getMainLooper());
    private String runningBundlePath;
    private String runningVersion;
    private final Runnable startupTimeout = () -> {
        BundleStore.fail(this, runningBundlePath);
        recreate();
    };

    @Override
    protected void load() {
        if (!BuildConfig.STARTUP_VARIANT.equals("standard")) {
            // A/B tests use bundled assets without changing any existing OTA or save state.
            runningBundlePath = null;
            runningVersion = BundleStore.nativeVersion(this);
        } else {
            BundleState state = BundleStore.prepare(this);
            runningBundlePath = state.launchingPath;
            runningVersion = runningBundlePath == null ? state.binaryVersion : state.launchingVersion;
        }
        startupDiagnostics.mark(runningBundlePath == null ? "选择 APK 内置网页" : "选择热更新网页");
        // The builder applies this path AFTER the local server exists. Never load URLs in Plugin.load().
        bridgeBuilder.setServerPath(new ServerPath(
            runningBundlePath == null ? ServerPath.PathType.ASSET_PATH : ServerPath.PathType.BASE_PATH,
            runningBundlePath == null ? "public" : runningBundlePath));
        super.load();
        startupDiagnostics.mark("WebView 与本地资源服务已创建");
        if (runningBundlePath != null) startupHandler.postDelayed(startupTimeout, 30000);
    }

    boolean confirmReady(String version) {
        if (!runningVersion.equals(version)) return false;
        if (runningBundlePath != null && !BundleStore.confirm(this, runningBundlePath, version)) {
            // React StrictMode or an already-confirmed page may acknowledge twice.
            BundleState state = BundleStore.read(this);
            if (!runningBundlePath.equals(state.activePath)) return false;
        }
        startupHandler.removeCallbacks(startupTimeout);
        startupDiagnostics.ready();
        return true;
    }

    String runningVersion() { return runningVersion; }

    @Override
    public void onDestroy() {
        startupDiagnostics.destroy();
        startupHandler.removeCallbacks(startupTimeout);
        super.onDestroy();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        startupDiagnostics.start();
        bridgeBuilder.addWebViewListener(startupDiagnostics);
        registerPlugin(StartupDiagnosticsPlugin.class);
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(SaveExportPlugin.class);
        try {
            super.onCreate(savedInstanceState);
        } catch (RuntimeException error) {
            startupDiagnostics.showFailure("原生初始化失败：" + error.getClass().getSimpleName());
            return;
        }
        if (getBridge() == null || getBridge().getWebView() == null) {
            startupDiagnostics.showFailure("系统 WebView 无法创建");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getWindow().getDecorView().setImportantForAutofill(
                View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
            );
            getBridge().getWebView().setImportantForAutofill(
                View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
            );
        }
        inputFocus = new InputFocusGuard(this, getBridge().getWebView(), BuildConfig.STARTUP_VARIANT.equals("compat"));
    }
}
