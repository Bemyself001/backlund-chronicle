package io.github.bemyself001.backlundchronicle;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    private static final String PREFS = "backlund-ota";
    private static final String KEY_PATH = "bundlePath";
    private static final String KEY_VERSION = "bundleVersion";

    /** 插件 load() 在页面加载前执行：此时切换资源路径，无需 reload，避免本地服务器未就绪的竞态。 */
    @Override
    public void load() {
        String path = activeBundlePath(getContext());
        if (path != null) {
            getBridge().setServerAssetPath(path);
        }
    }

    @PluginMethod
    public void openDownload(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("无效的更新地址");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve(new JSObject());
    }

    /** 启动时读取已就绪的 OTA 资源目录；目录损坏时回退到内置资源。 */
    public static String activeBundlePath(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String path = prefs.getString(KEY_PATH, null);
        if (path == null) return null;
        File dir = new File(path);
        File entry = new File(dir, "index.html");
        if (dir.isDirectory() && entry.isFile()) return path;
        prefs.edit().remove(KEY_PATH).remove(KEY_VERSION).apply();
        return null;
    }

    public static String activeBundleVersion(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_VERSION, null);
    }

    @PluginMethod
    public void downloadBundle(PluginCall call) {
        String url = call.getString("url");
        String version = call.getString("version", "");
        String sha256 = call.getString("sha256", "");
        if (url == null || !url.startsWith("https://")) {
            call.reject("无效的热更新地址");
            return;
        }
        final String targetVersion = version.isEmpty() ? String.valueOf(System.currentTimeMillis()) : version;
        final String expectedHash = sha256 == null ? "" : sha256.trim().toLowerCase();
        new Thread(() -> {
            File bundlesRoot = new File(getContext().getFilesDir(), "bundles");
            File zipFile = new File(bundlesRoot, targetVersion + ".zip");
            File targetDir = new File(bundlesRoot, targetVersion);
            try {
                bundlesRoot.mkdirs();
                download(url, zipFile);
                if (!expectedHash.isEmpty() && !expectedHash.equals(sha256Of(zipFile))) {
                    throw new Exception("热更新包校验失败");
                }
                deleteRecursively(targetDir);
                unzip(zipFile, targetDir);
                if (!new File(targetDir, "index.html").isFile()) throw new Exception("热更新包缺少入口文件");
                zipFile.delete();
                JSObject result = new JSObject();
                result.put("path", targetDir.getAbsolutePath());
                result.put("version", targetVersion);
                call.resolve(result);
            } catch (Exception error) {
                zipFile.delete();
                deleteRecursively(targetDir);
                call.reject("热更新下载失败：" + error.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void applyBundle(PluginCall call) {
        String path = call.getString("path");
        String version = call.getString("version", "");
        if (path == null || !new File(path, "index.html").isFile()) {
            call.reject("热更新资源不存在");
            return;
        }
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_PATH, path).putString(KEY_VERSION, version).apply();
        boolean reload = Boolean.TRUE.equals(call.getBoolean("reload", false));
        if (reload) {
            getActivity().runOnUiThread(() -> {
                getBridge().setServerAssetPath(path);
                getBridge().reload();
            });
        }
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void resetBundle(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().remove(KEY_PATH).remove(KEY_VERSION).apply();
        boolean reload = Boolean.TRUE.equals(call.getBoolean("reload", false));
        if (reload) getActivity().runOnUiThread(() -> getBridge().reload());
        call.resolve(new JSObject());
    }

    private static void download(String url, File target) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);
        connection.setInstanceFollowRedirects(true);
        int status = connection.getResponseCode();
        if (status >= 300 && status < 400) {
            String location = connection.getHeaderField("Location");
            connection.disconnect();
            if (location == null) throw new Exception("HTTP " + status);
            download(location, target);
            return;
        }
        if (status != 200) {
            connection.disconnect();
            throw new Exception("HTTP " + status);
        }
        try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
        } finally {
            connection.disconnect();
        }
    }

    private static String sha256Of(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    private static void unzip(File zipFile, File targetDir) throws Exception {
        targetDir.mkdirs();
        String canonicalTarget = targetDir.getCanonicalPath() + File.separator;
        try (ZipInputStream zip = new ZipInputStream(new FileInputStream(zipFile))) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zip.getNextEntry()) != null) {
                File outFile = new File(targetDir, entry.getName());
                if (!outFile.getCanonicalPath().startsWith(canonicalTarget)) throw new Exception("热更新包含非法路径");
                if (entry.isDirectory()) {
                    outFile.mkdirs();
                    continue;
                }
                outFile.getParentFile().mkdirs();
                try (FileOutputStream out = new FileOutputStream(outFile)) {
                    int read;
                    while ((read = zip.read(buffer)) != -1) out.write(buffer, 0, read);
                }
                zip.closeEntry();
            }
        }
    }

    private static void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        file.delete();
    }
}
