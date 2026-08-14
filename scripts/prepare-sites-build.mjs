import { access, copyFile, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const buildDirectory = resolve(projectRoot, "dist");
const clientDirectory = resolve(buildDirectory, "client");
const clientEntrySource = resolve(buildDirectory, "index.html");
const clientAssetsSource = resolve(buildDirectory, "assets");
const clientEntryTarget = resolve(clientDirectory, "index.html");
const clientAssetsTarget = resolve(clientDirectory, "assets");
const workerSource = resolve(projectRoot, "worker", "index.js");
const workerDirectory = resolve(buildDirectory, "server");
const workerTarget = resolve(workerDirectory, "index.js");

await access(clientEntrySource);
await access(clientAssetsSource);
await access(workerSource);
await mkdir(clientDirectory, { recursive: true });
await rename(clientEntrySource, clientEntryTarget);
await rename(clientAssetsSource, clientAssetsTarget);
await mkdir(workerDirectory, { recursive: true });
await copyFile(workerSource, workerTarget);
