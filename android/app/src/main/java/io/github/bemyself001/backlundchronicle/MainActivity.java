package io.github.bemyself001.backlundchronicle;

import com.getcapacitor.BridgeActivity;

import android.os.Build;
import android.os.Bundle;
import android.view.View;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        // OTA 热更新：若已下载就绪的 Web 资源包，直接改用它并重新载入
        String otaPath = UpdaterPlugin.activeBundlePath(this);
        if (otaPath != null) {
            getBridge().setServerAssetPath(otaPath);
            getBridge().reload();
        }
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
