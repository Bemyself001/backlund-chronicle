import { Capacitor, registerPlugin } from "@capacitor/core";

const REPOSITORY = "Bemyself001/backlund-chronicle";
const RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const PAGES_MANIFEST = "https://bemyself001.github.io/backlund-chronicle/latest.json";
const CHECK_TIMEOUT = 8000;
const CHECKED_AT_KEY = "backlund-update-checked-at";
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;

// 公共加速镜像随时可能失效，仅作为直连失败后的备选；顺序即优先级。
const MIRROR_PREFIXES = [
  "https://ghproxy.net/",
  "https://gh-proxy.com/",
];

export const APP_VERSION = import.meta.env?.VITE_APP_VERSION || "1.1.0";
export const WEB_BUILD = (import.meta.env?.VITE_APP_BUILD || "local").slice(0, 7);

const Updater = registerPlugin("Updater");

function versionParts(value) {
  const match = String(value || "").match(/(?:^|v)(\d+)\.(\d+)\.(\d+)(?:$|[-+])/i);
  return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

async function fetchJsonWithTimeout(url, timeoutMs = CHECK_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function pickApkAsset(assets) {
  return assets?.find((asset) => asset.name === "backlund-chronicle.apk")
    || assets?.find((asset) => asset.name?.endsWith(".apk"));
}

export function pickBundleAsset(assets) {
  return assets?.find((asset) => asset.name === "web-bundle.zip") || null;
}

function shapeGitHubRelease(release) {
  const apk = pickApkAsset(release.assets);
  const bundle = pickBundleAsset(release.assets);
  return {
    latestVersion: String(release.tag_name || "").replace(/^v/i, ""),
    downloadUrl: apk?.browser_download_url || release.html_url,
    bundleUrl: bundle?.browser_download_url || null,
    bundleSha256: null, // Release 通道无法稳定获取校验文件，TLS 直连即可
    releaseUrl: release.html_url,
    notes: release.body || "本次发布未提供更新说明。",
  };
}

function shapePagesManifest(manifest) {
  if (!manifest?.version) throw new Error("备用清单缺少版本信息");
  return {
    latestVersion: String(manifest.version).replace(/^v/i, ""),
    downloadUrl: manifest.apkUrl || manifest.releaseUrl,
    bundleUrl: manifest.bundleUrl || null,
    bundleSha256: manifest.bundleSha256 || null,
    releaseUrl: manifest.releaseUrl,
    notes: manifest.notes || "本次发布未提供更新说明。",
  };
}

export function getDownloadOptions(result) {
  const options = [];
  const directUrl = result?.downloadUrl;
  if (directUrl) {
    options.push({ key: "direct", label: "直接下载", url: directUrl, primary: true });
    if (directUrl.startsWith("https://github.com/")) {
      for (const [index, prefix] of MIRROR_PREFIXES.entries()) {
        options.push({ key: `mirror-${index}`, label: `镜像加速下载 ${index + 1}`, url: `${prefix}${directUrl}` });
      }
    }
  }
  if (result?.releaseUrl) {
    options.push({ key: "release-page", label: "打开发布页手动下载", url: result.releaseUrl });
  }
  return options;
}

export async function checkForUpdate({ force = false } = {}) {
  if (!isNativeAndroid()) {
    return {
      platform: "web",
      currentVersion: "网页版",
      buildId: WEB_BUILD,
      hasUpdate: false,
      autoUpdated: true,
    };
  }
  const lastCheckedAt = Number(localStorage.getItem(CHECKED_AT_KEY) || 0);
  if (!force && Date.now() - lastCheckedAt < CHECK_INTERVAL) return { skipped: true, reason: "recent" };

  let release;
  let source;
  try {
    release = shapeGitHubRelease(await fetchJsonWithTimeout(RELEASE_API));
    source = "github";
  } catch (primaryError) {
    try {
      release = shapePagesManifest(await fetchJsonWithTimeout(PAGES_MANIFEST));
      source = "pages";
    } catch {
      throw new Error(`检查更新失败：发布服务器与备用通道均无法连接（${primaryError.message || "网络错误"}）`);
    }
  }
  localStorage.setItem(CHECKED_AT_KEY, String(Date.now()));
  return {
    currentVersion: APP_VERSION,
    latestVersion: release.latestVersion,
    hasUpdate: Boolean(release.downloadUrl) && compareVersions(release.latestVersion, APP_VERSION) > 0,
    downloadUrl: release.downloadUrl,
    bundleUrl: release.bundleUrl,
    bundleSha256: release.bundleSha256,
    releaseUrl: release.releaseUrl,
    notes: release.notes,
    source,
  };
}

export function canHotUpdate(result) {
  return isNativeAndroid() && Boolean(result?.hasUpdate && result?.bundleUrl);
}

/** 下载并校验 Web 热更新包；reload=false 时下次启动生效，true 时立即重新载入。 */
export async function downloadAndApplyOta(result, { reload = false } = {}) {
  if (!canHotUpdate(result)) throw new Error("当前环境不支持热更新");
  const bundle = await Updater.downloadBundle({
    url: result.bundleUrl,
    version: result.latestVersion,
    sha256: result.bundleSha256 || "",
  });
  await Updater.applyBundle({ path: bundle.path, version: result.latestVersion, reload });
  return bundle;
}

export async function resetOtaBundle({ reload = false } = {}) {
  if (!isNativeAndroid()) return;
  await Updater.resetBundle({ reload });
}

/** 已就绪的热更新立即生效（重新载入界面）。 */
export async function activateOtaNow(bundle) {
  if (!isNativeAndroid() || !bundle?.path) return;
  await Updater.applyBundle({ path: bundle.path, version: bundle.version || "", reload: true });
}

export async function openUpdateDownload(url) {
  if (isNativeAndroid()) {
    await Updater.openDownload({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
