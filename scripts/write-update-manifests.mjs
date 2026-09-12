import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function createUpdateManifest(release, bundleBytes, checksum) {
  const version = String(release.tag_name || "").replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Release version is missing or invalid");
  const apk = release.assets?.find((asset) => asset.name === "backlund-chronicle.apk");
  if (!apk) throw new Error("Release APK is missing");
  let digest = null;
  if (bundleBytes) {
    digest = createHash("sha256").update(bundleBytes).digest("hex");
    if (checksum?.trim().split(/\s+/)[0] !== digest) throw new Error("Release bundle checksum mismatch");
  }
  return {
    version,
    apkUrl: apk.browser_download_url,
    bundleUrl: digest ? `https://bemyself001.github.io/backlund-chronicle/ota/${version}/web-bundle-v2.zip` : null,
    bundleSha256: digest,
    minUpdaterProtocol: 2,
    releaseUrl: release.html_url,
    notes: release.body || "",
  };
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/write-update-manifests.mjs")) {
  const [, , releaseFile, output] = process.argv;
  const release = JSON.parse(readFileSync(releaseFile, "utf8"));
  const version = String(release.tag_name || "").replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid release version");
  const bundle = release.assets?.find((asset) => asset.name === "web-bundle-v2.zip");
  const bundlePath = join(output, "ota", version, "web-bundle-v2.zip");
  const manifest = createUpdateManifest(release,
    bundle ? readFileSync(bundlePath) : null,
    bundle ? readFileSync(`${bundlePath}.sha256`, "utf8") : null);
  writeFileSync(join(output, "latest-v2.json"), JSON.stringify(manifest, null, 2));
  // Old APKs have a broken loader: offer the full signed APK, never another OTA to them.
  writeFileSync(join(output, "latest.json"), JSON.stringify({
    ...manifest, bundleUrl: null, bundleSha256: null,
  }, null, 2));
}
