package io.github.bemyself001.backlundchronicle;

import android.content.Intent;
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
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    private static final AtomicBoolean downloading = new AtomicBoolean(false);

    @PluginMethod
    public void getStatus(PluginCall call) {
        BundleState state = BundleStore.read(getContext());
        JSObject result = new JSObject();
        result.put("updaterProtocol", BundleStore.PROTOCOL);
        result.put("nativeVersion", BundleStore.nativeVersion(getContext()));
        result.put("currentVersion", ((MainActivity) getActivity()).runningVersion());
        result.put("pendingVersion", state.pendingVersion);
        result.put("pendingPath", state.pendingPath);
        result.put("failedVersion", state.failedVersion);
        call.resolve(result);
    }

    @PluginMethod
    public void notifyReady(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (((MainActivity) getActivity()).confirmReady(call.getString("version", ""))) {
                call.resolve(new JSObject());
            } else {
                call.reject("页面版本与待确认的热更新版本不匹配");
            }
        });
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

    @PluginMethod
    public void downloadBundle(PluginCall call) {
        String url = call.getString("url");
        String version = call.getString("version", "");
        String sha256 = call.getString("sha256", "");
        if (url == null || !url.startsWith("https://") || !version.matches("[0-9]+\\.[0-9]+\\.[0-9]+")
            || sha256 == null || !sha256.matches("(?i)[a-f0-9]{64}")) {
            call.reject("热更新地址、版本或校验信息无效");
            return;
        }
        if (!downloading.compareAndSet(false, true)) {
            call.reject("已有热更新正在下载，请稍后重试");
            return;
        }
        final String targetVersion = version;
        final String expectedHash = sha256.toLowerCase(java.util.Locale.ROOT);
        new Thread(() -> {
            File bundlesRoot = new File(getContext().getFilesDir(), "bundles");
            // Every attempt owns a fresh directory; never overwrite the bundle currently in use.
            String downloadId = targetVersion + "-" + UUID.randomUUID();
            File zipFile = new File(bundlesRoot, downloadId + ".zip");
            File targetDir = new File(bundlesRoot, downloadId);
            try {
                bundlesRoot.mkdirs();
                download(url, zipFile, 0);
                if (!expectedHash.equals(sha256Of(zipFile))) {
                    throw new Exception("热更新包校验失败");
                }
                unzip(zipFile, targetDir);
                BundleStore.validate(getContext(), targetDir.getAbsolutePath(), targetVersion);
                zipFile.delete();
                JSObject result = new JSObject();
                result.put("path", targetDir.getAbsolutePath());
                result.put("version", targetVersion);
                call.resolve(result);
            } catch (Exception error) {
                zipFile.delete();
                deleteRecursively(targetDir);
                call.reject("热更新下载失败：" + error.getMessage());
            } finally {
                downloading.set(false);
            }
        }).start();
    }

    @PluginMethod
    public void applyBundle(PluginCall call) {
        String path = call.getString("path");
        String version = call.getString("version", "");
        try {
            BundleStore.stage(getContext(), path, version);
        } catch (Exception error) {
            call.reject(error.getMessage());
            return;
        }
        boolean reload = Boolean.TRUE.equals(call.getBoolean("reload", false));
        call.resolve(new JSObject());
        if (reload) {
            getActivity().runOnUiThread(() -> getActivity().recreate());
        }
    }

    @PluginMethod
    public void resetBundle(PluginCall call) {
        BundleStore.reset(getContext());
        boolean reload = Boolean.TRUE.equals(call.getBoolean("reload", false));
        call.resolve(new JSObject());
        if (reload) getActivity().runOnUiThread(() -> getActivity().recreate());
    }

    private static void download(String url, File target, int redirects) throws Exception {
        if (!url.startsWith("https://") || redirects > 5) throw new Exception("热更新下载重定向无效");
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);
        connection.setInstanceFollowRedirects(false);
        int status = connection.getResponseCode();
        if (status >= 300 && status < 400) {
            String location = connection.getHeaderField("Location");
            connection.disconnect();
            if (location == null) throw new Exception("HTTP " + status);
            download(new URL(new URL(url), location).toString(), target, redirects + 1);
            return;
        }
        if (status != 200) {
            connection.disconnect();
            throw new Exception("HTTP " + status);
        }
        try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[8192];
            int read;
            long size = 0;
            while ((read = in.read(buffer)) != -1) {
                size += read;
                if (size > 32L * 1024 * 1024) throw new Exception("热更新下载包过大");
                out.write(buffer, 0, read);
            }
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
            long size = 0;
            int entries = 0;
            while ((entry = zip.getNextEntry()) != null) {
                if (++entries > 4096) throw new Exception("热更新文件数量过多");
                File outFile = new File(targetDir, entry.getName());
                if (!outFile.getCanonicalPath().startsWith(canonicalTarget)) throw new Exception("热更新包含非法路径");
                if (entry.isDirectory()) {
                    outFile.mkdirs();
                    continue;
                }
                outFile.getParentFile().mkdirs();
                try (FileOutputStream out = new FileOutputStream(outFile)) {
                    int read;
                    while ((read = zip.read(buffer)) != -1) {
                        size += read;
                        if (size > 128L * 1024 * 1024) throw new Exception("热更新解压包过大");
                        out.write(buffer, 0, read);
                    }
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
