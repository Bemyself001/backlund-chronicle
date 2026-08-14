import { access, copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const clientEntry = resolve(projectRoot, "dist", "index.html");
const workerSource = resolve(projectRoot, "worker", "index.js");
const workerDirectory = resolve(projectRoot, "dist", "server");
const workerTarget = resolve(workerDirectory, "index.js");

await access(clientEntry);
await access(workerSource);
await mkdir(workerDirectory, { recursive: true });
await copyFile(workerSource, workerTarget);
