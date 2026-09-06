import test from "node:test";
import assert from "node:assert/strict";

import { compareVersions, getDownloadOptions } from "../src/services/updates.js";

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
