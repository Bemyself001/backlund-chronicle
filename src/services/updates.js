import { Capacitor, registerPlugin } from "@capacitor/core";

const REPOSITORY = "Bemyself001/backlund-chronicle";
const RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const CHECKED_AT_KEY = "backlund-update-checked-at";
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;

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

  const response = await fetch(RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`检查更新失败（HTTP ${response.status}）`);
  const release = await response.json();
  const apk = release.assets?.find((asset) => asset.name === "backlund-chronicle.apk")
    || release.assets?.find((asset) => asset.name?.endsWith(".apk"));
  localStorage.setItem(CHECKED_AT_KEY, String(Date.now()));
  const latestVersion = String(release.tag_name || "").replace(/^v/i, "");
  return {
    currentVersion: APP_VERSION,
    latestVersion,
    hasUpdate: Boolean(apk) && compareVersions(latestVersion, APP_VERSION) > 0,
    downloadUrl: apk?.browser_download_url || release.html_url,
    releaseUrl: release.html_url,
    notes: release.body || "本次发布未提供更新说明。",
  };
}

export async function openUpdateDownload(url) {
  if (isNativeAndroid()) {
    await Updater.openDownload({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
