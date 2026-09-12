import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Capacitor } from "@capacitor/core";
import { createUpdateManifest } from "../scripts/write-update-manifests.mjs";

import { compareVersions, getDownloadOptions, shapeGitHubRelease, shapePagesManifest } from "../src/services/updates.js";

test("compareVersions orders semantic versions", () => {
  assert.equal(compareVersions("1.1.52", "1.1.51"), 1);
  assert.equal(compareVersions("v1.2.0", "1.10.0"), -1);
  assert.equal(compareVersions("1.1.0", "1.1.0"), 0);
  assert.equal(compareVersions("garbage", "1.1.0"), 0);
});

test("getDownloadOptions lists direct, mirrors, and release page", () => {
  const direct = "https://github.com/Bemyself001/backlund-chronicle/releases/download/v1.1.52/backlund-chronicle.apk";
  const options = getDownloadOptions({
    downloadUrl: direct,
    releaseUrl: "https://github.com/Bemyself001/backlund-chronicle/releases/tag/v1.1.52",
  });
  assert.equal(options[0].primary, true);
  assert.equal(options[0].url, direct);
  const mirrors = options.filter((option) => option.label.startsWith("镜像加速下载"));
  assert.equal(mirrors.length, 2);
  assert.ok(mirrors.every((option) => option.url.endsWith(direct)));
  assert.equal(options.at(-1).label, "打开发布页手动下载");
});

test("getDownloadOptions skips mirrors for non-GitHub urls", () => {
  const options = getDownloadOptions({
    downloadUrl: "https://example.com/app.apk",
    releaseUrl: "https://example.com/release",
  });
  assert.equal(options.length, 2);
  assert.equal(options[1].label, "打开发布页手动下载");
});

import { pickBundleAsset, canHotUpdate } from "../src/services/updates.js";

test("pickBundleAsset finds the OTA web bundle among release assets", () => {
  const assets = [
    { name: "backlund-chronicle.apk" },
    { name: "web-bundle.zip" },
    { name: "web-bundle-v2.zip" },
    { name: "web-bundle-v2.zip.sha256" },
  ];
  assert.equal(pickBundleAsset(assets)?.name, "web-bundle-v2.zip");
  assert.equal(pickBundleAsset([{ name: "web-bundle.zip" }]), null);
  assert.equal(pickBundleAsset([{ name: "backlund-chronicle.apk" }]), null);
  assert.equal(pickBundleAsset(undefined), null);
});

test("OTA requires a repaired native loader, checksum and a release that has not failed startup", (t) => {
  const oldNative = Capacitor.isNativePlatform;
  const oldPlatform = Capacitor.getPlatform;
  Capacitor.isNativePlatform = () => true;
  Capacitor.getPlatform = () => "android";
  t.after(() => {
    Capacitor.isNativePlatform = oldNative;
    Capacitor.getPlatform = oldPlatform;
  });
  const release = {
    hasUpdate: true, latestVersion: "1.2.101", bundleUrl: "https://example.com/bundle.zip",
    bundleSha256: "a".repeat(64), minUpdaterProtocol: 2, updaterProtocol: 2,
  };
  assert.equal(canHotUpdate(release), true);
  assert.equal(canHotUpdate({ ...release, updaterProtocol: 0 }), false);
  assert.equal(canHotUpdate({ ...release, bundleSha256: null }), false);
  assert.equal(canHotUpdate({ ...release, minUpdaterProtocol: 3 }), false);
  assert.equal(canHotUpdate({ ...release, failedVersion: "1.2.101" }), false);
});

test("Release and Pages describe the same checked OTA bytes and version", () => {
  const bytes = Buffer.from("exact bytes from the APK release build");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const release = { tag_name: "v1.2.100", html_url: "https://example.com/release", assets: [
    { name: "backlund-chronicle.apk", browser_download_url: "https://example.com/app.apk" },
    { name: "web-bundle-v2.zip", browser_download_url: "https://example.com/bundle.zip", digest: `sha256:${hash}` },
  ] };
  const github = shapeGitHubRelease(release);
  const manifest = createUpdateManifest(release, bytes, `${hash}  web-bundle-v2.zip\n`);
  const pages = shapePagesManifest(manifest);
  assert.equal(github.latestVersion, pages.latestVersion);
  assert.equal(github.bundleSha256, pages.bundleSha256);
  assert.equal(pages.minUpdaterProtocol, 2);
  assert.ok(pages.bundleUrl.endsWith("/ota/1.2.100/web-bundle-v2.zip"));
  assert.throws(() => createUpdateManifest(release, bytes, "0".repeat(64)), /checksum mismatch/);
  assert.throws(() => createUpdateManifest({ ...release, assets: [] }), /APK is missing/);
});

test("canHotUpdate requires native android, an update and a bundle url", () => {
  // 测试环境是非原生（web），因此一律为 false
  assert.equal(canHotUpdate({ hasUpdate: true, bundleUrl: "https://x/web-bundle.zip" }), false);
  assert.equal(canHotUpdate(null), false);
});
