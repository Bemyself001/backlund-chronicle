import { spawnSync } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const variant = process.argv[2];
if (!["diagnostic", "compat"].includes(variant)) throw new Error("Choose diagnostic or compat");
const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const vite = resolve(require.resolve("vite/package.json"), "../bin/vite.js");
for (const args of [
  [vite, "build", "--configLoader", "runner", "--mode", variant],
  ["scripts/prepare-sites-build.mjs"],
  ["scripts/prepare-ota-bundle.mjs"],
]) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
// Keep both test builds when the regular production build later replaces dist/.
// Use a separate timestamp per run so obsolete hashed assets cannot mix with a new build.
const output = resolve(root, ".shots/startup-builds", variant, new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(output, { recursive: true });
await cp(resolve(root, "dist/client"), resolve(output, "web"), { recursive: true });
await cp(resolve(root, "dist/贝克兰德纪事-离线版.html"), resolve(output, "web/离线启动测试.html"));
await writeFile(resolve(root, `.shots/startup-builds/${variant}/latest.json`), JSON.stringify({ variant, output }, null, 2));
console.log(`Startup ${variant} web build: ${output}`);
console.log(`APK: cap sync android, then Gradle -PSTARTUP_VARIANT=${variant} assembleRelease (existing signing required)`);
