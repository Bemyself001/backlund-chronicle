import { writeFileSync } from "node:fs";

const version = process.env.VITE_APP_VERSION || "1.1.0";
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid OTA version");
writeFileSync("dist/client/bundle-manifest.json", JSON.stringify({
  version,
  minUpdaterProtocol: 2,
  build: process.env.VITE_APP_BUILD || "local",
}, null, 2));
