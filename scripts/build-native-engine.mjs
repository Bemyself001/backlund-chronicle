import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("vite")] }));
const root = fileURLToPath(new URL("../", import.meta.url));
const destination = fileURLToPath(new URL("../android/native-app/src/main/assets/", import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/native/entry.js"], bundle: true, write: false,
  format: "iife", platform: "neutral", target: "es2020", charset: "utf8",
  metafile: true, treeShaking: true,
});
// A native rules bundle must not acquire React, Capacitor, or a browser renderer.
const forbidden = Object.keys(result.metafile.inputs).filter(path => /node_modules.*(?:react|capacitor)|\.jsx$/.test(path));
if (forbidden.length) throw new Error(`Browser dependencies in native engine: ${forbidden.join(", ")}`);
await mkdir(destination, { recursive: true });
const source = result.outputFiles[0].contents;
await writeFile(`${destination}engine.js`, source);
await writeFile(`${destination}engine-manifest.json`, JSON.stringify({
  format: "backlund-native-engine", version: 1, build: process.env.GITHUB_SHA || "local",
  sha256: createHash("sha256").update(source).digest("hex"),
  bytes: source.byteLength, modules: Object.keys(result.metafile.inputs).length,
}, null, 2));
console.log(`Native rules engine: ${source.byteLength} bytes, ${Object.keys(result.metafile.inputs).length} modules; no browser renderer.`);
