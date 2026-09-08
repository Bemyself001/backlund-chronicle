import { access, copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const buildDirectory = resolve(projectRoot, "dist");
const clientDirectory = resolve(buildDirectory, "client");
const clientEntrySource = resolve(buildDirectory, "index.html");
const clientAssetsSource = resolve(buildDirectory, "assets");
const clientEntryTarget = resolve(clientDirectory, "index.html");
const clientAssetsTarget = resolve(clientDirectory, "assets");
const standaloneTarget = resolve(buildDirectory, "贝克兰德纪事-离线版.html");
const workerSource = resolve(projectRoot, "worker", "index.js");
const workerDirectory = resolve(buildDirectory, "server");
const workerTarget = resolve(workerDirectory, "index.js");

await access(clientEntrySource);
await access(clientAssetsSource);
await access(workerSource);

const clientEntry = await readFile(clientEntrySource, "utf8");
const scriptMatch = clientEntry.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/i);
const stylesheetMatch = clientEntry.match(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/i);

if (!scriptMatch || !stylesheetMatch) {
  throw new Error("Unable to locate the production JavaScript and stylesheet in index.html.");
}

const scriptSource = resolve(buildDirectory, scriptMatch[1].replace(/^\//, ""));
const stylesheetSource = resolve(buildDirectory, stylesheetMatch[1].replace(/^\//, ""));
const [script, stylesheet] = await Promise.all([
  readFile(scriptSource, "utf8"),
  readFile(stylesheetSource, "utf8"),
]);
const standaloneEntry = clientEntry
  .replace(scriptMatch[0], () => `<script type="module">${script.replace(/<\/script/gi, "<\\/script")}</script>`)
  .replace(stylesheetMatch[0], () => `<style>${stylesheet.replace(/<\/style/gi, "<\\/style")}</style>`);

if (/<script\b[^>]*\bsrc=/i.test(standaloneEntry) || /<link\b[^>]*\brel="stylesheet"/i.test(standaloneEntry)) {
  throw new Error("The offline HTML still contains an external JavaScript or stylesheet reference.");
}

await writeFile(standaloneTarget, standaloneEntry, "utf8");
await mkdir(clientDirectory, { recursive: true });
await rename(clientEntrySource, clientEntryTarget);
await rename(clientAssetsSource, clientAssetsTarget);
await mkdir(workerDirectory, { recursive: true });
await copyFile(workerSource, workerTarget);
