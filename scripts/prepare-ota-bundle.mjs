import { writeFileSync } from "node:fs";
import { RELEASE_VERSION } from "../src/data/release.js";

const version = process.env.VITE_APP_VERSION || RELEASE_VERSION;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid OTA version");
writeFileSync("dist/client/bundle-manifest.json", JSON.stringify({
  version,
  minUpdaterProtocol: 2,
  build: process.env.VITE_APP_BUILD || "local",
}, null, 2));
