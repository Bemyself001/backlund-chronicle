package io.github.bemyself001.backlundchronicle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.ServerPath;

import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;

public class MainActivity extends BridgeActivity {
    private final Handler startupHandler = new Handler(Looper.getMainLooper());
    private String runningBundlePath;
    private String runningVersion;
    private final Runnable startupTimeout = () -> {
        BundleStore.fail(this, runningBundlePath);
        recreate();
    };

    @Override
    protected void load() {
        BundleState state = BundleStore.prepare(this);
        runningBundlePath = state.launchingPath;
        runningVersion = runningBundlePath == null ? state.binaryVersion : state.launchingVersion;
        // The builder applies this path AFTER the local server exists. Never load URLs in Plugin.load().
        bridgeBuilder.setServerPath(new ServerPath(
            runningBundlePath == null ? ServerPath.PathType.ASSET_PATH : ServerPath.PathType.BASE_PATH,
            runningBundlePath == null ? "public" : runningBundlePath));
        super.load();
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
        return true;
    }

    String runningVersion() { return runningVersion; }

    @Override
    public void onDestroy() {
        startupHandler.removeCallbacks(startupTimeout);
        super.onDestroy();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getWindow().getDecorView().setImportantForAutofill(
                View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
            );
            getBridge().getWebView().setImportantForAutofill(
                View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
            );
        }
    }
}
