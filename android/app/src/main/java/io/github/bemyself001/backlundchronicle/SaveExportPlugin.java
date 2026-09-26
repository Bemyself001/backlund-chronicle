package io.github.bemyself001.backlundchronicle;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "SaveExport")
public class SaveExportPlugin extends Plugin {
    private final AtomicBoolean saving = new AtomicBoolean(false);

    @PluginMethod
    public void save(PluginCall call) {
        String content = call.getString("content");
        String fileName = call.getString("fileName", "");
        if (content == null || fileName.isEmpty() || !fileName.endsWith(".json")
                || fileName.matches("(?s).*[\\\\/:*?\"<>|\\p{Cntrl}].*")) {
            call.reject("存档内容或文件名无效");
            return;
        }
        if (!saving.compareAndSet(false, true)) {
            call.reject("正在导出存档，请稍候");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            new Thread(() -> saveToDownloads(call, fileName, content)).start();
        } else {
            getActivity().runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");
                    intent.putExtra(Intent.EXTRA_TITLE, fileName);
                    startActivityForResult(call, intent, "documentCreated");
                } catch (Exception error) {
                    saving.set(false);
                    call.reject("无法打开系统保存窗口", error);
                }
            });
        }
    }

    private void saveToDownloads(PluginCall call, String fileName, String content) {
        ContentResolver resolver = getContext().getContentResolver();
        Uri uri = null;
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/贝克兰德纪事/");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            uri = resolver.insert(MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
            if (uri == null) throw new IOException("无法创建下载文件");
            write(resolver, uri, content);
            String actualName;
            String relativePath;
            try (Cursor cursor = resolver.query(uri, new String[] {
                    MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.RELATIVE_PATH
            }, null, null, null)) {
                if (cursor == null || !cursor.moveToFirst()) throw new IOException("无法确认保存位置");
                actualName = cursor.getString(0);
                relativePath = cursor.getString(1);
                if (actualName == null || relativePath == null) throw new IOException("无法确认保存位置");
            }
            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            if (resolver.update(uri, values, null, null) != 1) throw new IOException("无法完成文件保存");
            JSObject result = new JSObject();
            result.put("status", "saved");
            result.put("fileName", actualName);
            result.put("location", "内部存储/" + relativePath + (relativePath.endsWith("/") ? "" : "/") + actualName);
            result.put("hint", "打开手机“文件管理 → 内部存储 → Download（下载）→ 贝克兰德纪事”即可找到。");
            call.resolve(result);
        } catch (Exception error) {
            // Remove only the row created by this failed export.
            if (uri != null) {
                try { resolver.delete(uri, null, null); } catch (Exception ignored) { }
            }
            call.reject("存档导出失败：" + error.getMessage(), error);
        } finally {
            saving.set(false);
        }
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult activityResult) {
        if (call == null) { saving.set(false); return; }
        Intent intent = activityResult.getData();
        Uri uri = intent == null ? null : intent.getData();
        if (activityResult.getResultCode() != Activity.RESULT_OK || uri == null) {
            saving.set(false);
            JSObject cancelled = new JSObject();
            cancelled.put("status", "cancelled");
            call.resolve(cancelled);
            return;
        }
        new Thread(() -> {
            try {
                ContentResolver resolver = getContext().getContentResolver();
                write(resolver, uri, call.getString("content", ""));
                String fileName = call.getString("fileName", "存档.json");
                try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst() && cursor.getString(0) != null) fileName = cursor.getString(0);
                } catch (Exception ignored) { }
                String location = "你刚才在系统保存窗口中选择的位置";
                try {
                    if ("com.android.externalstorage.documents".equals(uri.getAuthority())) {
                        String[] parts = DocumentsContract.getDocumentId(uri).split(":", 2);
                        if (parts.length == 2) location = ("primary".equals(parts[0]) ? "内部存储/" : "存储卷 " + parts[0] + "/") + parts[1];
                    }
                } catch (Exception ignored) { }
                JSObject result = new JSObject();
                result.put("status", "saved");
                result.put("fileName", fileName);
                result.put("location", location);
                result.put("hint", "请在系统保存窗口中所选的文件夹查找。部分文件服务不提供完整磁盘路径。");
                call.resolve(result);
            } catch (Exception error) {
                call.reject("存档导出失败：" + error.getMessage(), error);
            } finally {
                saving.set(false);
            }
        }).start();
    }

    private static void write(ContentResolver resolver, Uri uri, String content) throws IOException {
        try (OutputStream output = resolver.openOutputStream(uri, "wt")) {
            if (output == null) throw new IOException("无法打开存档文件");
            output.write(content.getBytes(StandardCharsets.UTF_8));
            output.flush();
        }
    }
}
