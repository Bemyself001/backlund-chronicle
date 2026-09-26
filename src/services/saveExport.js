import { Capacitor, registerPlugin } from "@capacitor/core";

const SaveExport = registerPlugin("SaveExport");

export function saveExportFileName(game) {
  const name = String(game.character?.name || "未命名角色")
    .replace(/[\\/:*?"<>|]/g, "_").replace(/\p{Cc}/gu, "").trim().slice(0, 60) || "未命名角色";
  return `贝克兰德纪事-${name}-第${game.turn}轮.json`;
}

export async function writeSaveExport(payload, fileName, environment = {}) {
  const runtime = environment.capacitor || Capacitor;
  if (runtime.isNativePlatform() && runtime.getPlatform() === "android") {
    if (!runtime.isPluginAvailable("SaveExport")) {
      throw new Error("当前 APK 尚不支持存档文件导出。请在版本更新中下载新版 APK 覆盖安装；仅热更新页面无法启用此功能。");
    }
    return (environment.nativeExporter || SaveExport).save({ content: payload, fileName });
  }

  const browser = environment.browser || window;
  // Browser save handles deliberately do not expose an absolute filesystem path.
  if (typeof browser.showSaveFilePicker === "function") {
    let handle;
    let writable;
    try {
      handle = await browser.showSaveFilePicker({
        suggestedName: fileName, startIn: "downloads",
        types: [{ description: "贝克兰德纪事存档", accept: { "application/json": [".json"] } }],
      });
      writable = await handle.createWritable();
      await writable.write(payload);
      await writable.close();
      return {
        status: "saved", fileName: handle.name,
        location: "你刚才在“另存为”窗口中选择的文件夹",
        hint: "浏览器不提供完整磁盘路径，请在所选文件夹中查找此文件。",
      };
    } catch (error) {
      if (writable) await writable.abort().catch(() => {});
      if (error.name === "AbortError" && !handle) return { status: "cancelled" };
      throw error;
    }
  }

  const document = environment.document || browser.document;
  const urls = environment.urls || URL;
  const schedule = environment.schedule || setTimeout;
  const blob = new Blob([payload], { type: "application/json" });
  const url = urls.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Keep the blob alive while mobile browsers consume the download.
    schedule(() => urls.revokeObjectURL(url), 60000);
  }
  return {
    status: "download-requested", fileName,
    location: "浏览器设置的下载文件夹（通常为“下载 / Download”）",
    hint: "已发起下载。请在浏览器的下载记录中确认完成；手机可打开“文件 / 文件管理”查找，iPhone 可在“文件 → 下载项”中查找。若选择了其他文件夹，以你的选择为准。浏览器可能为重名文件添加序号。",
  };
}
