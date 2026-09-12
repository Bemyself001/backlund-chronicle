package io.github.bemyself001.backlundchronicle;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

final class BundleStore {
    static final int PROTOCOL = 2;

    static String nativeVersion(Context context) {
        try {
            return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
        } catch (Exception error) {
            throw new IllegalStateException("无法读取 APK 版本", error);
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("backlund-ota", Context.MODE_PRIVATE);
    }

    static synchronized BundleState read(Context context) {
        SharedPreferences p = prefs(context);
        BundleState s = new BundleState();
        s.binaryVersion = p.getString("binaryVersion", null);
        s.activePath = p.getString("activePath", null);
        s.activeVersion = p.getString("activeVersion", null);
        s.pendingPath = p.getString("pendingPath", null);
        s.pendingVersion = p.getString("pendingVersion", null);
        s.launchingPath = p.getString("launchingPath", null);
        s.launchingVersion = p.getString("launchingVersion", null);
        s.failedVersion = p.getString("failedVersion", null);
        return s;
    }

    private static void write(Context context, BundleState s) {
        // Only updater preferences are replaced. Game saves and WebView storage are untouched.
        boolean saved = prefs(context).edit().clear()
            .putString("binaryVersion", s.binaryVersion)
            .putString("activePath", s.activePath).putString("activeVersion", s.activeVersion)
            .putString("pendingPath", s.pendingPath).putString("pendingVersion", s.pendingVersion)
            .putString("launchingPath", s.launchingPath).putString("launchingVersion", s.launchingVersion)
            .putString("failedVersion", s.failedVersion).commit();
        if (!saved) throw new IllegalStateException("无法保存热更新状态");
    }

    static void validate(Context context, String path, String version) throws Exception {
        if (path == null || version == null) throw new IOException("热更新资源不存在");
        File root = new File(context.getFilesDir(), "bundles").getCanonicalFile();
        File dir = new File(path).getCanonicalFile();
        if (!dir.getPath().startsWith(root.getPath() + File.separator)
            || !new File(dir, "index.html").isFile()) throw new IOException("热更新目录无效");
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (FileInputStream input = new FileInputStream(new File(dir, "bundle-manifest.json"))) {
            byte[] buffer = new byte[1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (bytes.size() + count > 16384) throw new IOException("热更新清单过大");
                bytes.write(buffer, 0, count);
            }
        }
        JSONObject manifest = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        if (!version.equals(manifest.getString("version"))) throw new IOException("热更新包版本不匹配");
        int protocol = manifest.getInt("minUpdaterProtocol");
        if (protocol != PROTOCOL) throw new IOException("请先安装新版 APK");
    }

    static synchronized BundleState prepare(Context context) {
        BundleState s = read(context);
        s.prepare(nativeVersion(context));
        // A broken pending bundle can fall back to the previously confirmed bundle.
        while (s.launchingPath != null) {
            try {
                validate(context, s.launchingPath, s.launchingVersion);
                break;
            } catch (Exception error) {
                s.fail(s.launchingPath);
                s.prepare(s.binaryVersion);
            }
        }
        write(context, s);
        return s;
    }

    static synchronized void stage(Context context, String path, String version) throws Exception {
        validate(context, path, version);
        BundleState s = read(context);
        s.stage(path, version);
        write(context, s);
    }

    static synchronized boolean confirm(Context context, String path, String version) {
        BundleState s = read(context);
        if (!s.confirm(path, version)) return false;
        write(context, s);
        return true;
    }

    static synchronized void fail(Context context, String path) {
        BundleState s = read(context);
        s.fail(path);
        write(context, s);
    }

    static synchronized void reset(Context context) {
        BundleState s = read(context);
        s.reset();
        write(context, s);
    }
}
