import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sites } from "@openai/sites-vite-plugin";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RELEASE_VERSION } from "./src/data/release.js";

export default defineConfig(({ mode }) => {
  const variant = ["diagnostic", "compat"].includes(mode) ? mode : "standard";
  const readStartup = (name) => readFileSync(new URL(`./src/startup/${name}`, import.meta.url), "utf8");
  return {
    base: "./",
    define: { "import.meta.env.VITE_STARTUP_VARIANT": JSON.stringify(variant) },
    resolve: { alias: { "startup-compat": fileURLToPath(new URL(
      variant === "compat" ? "./src/startup/compat.js" : "./src/startup/no-compat.js", import.meta.url,
    )) } },
    build: { sourcemap: variant !== "standard" ? "hidden" : false,
      ...(variant === "compat" ? { target: ["chrome80", "es2020"], cssTarget: "chrome80" } : {}) },
    plugins: [react(), sites(), {
      name: "startup-diagnostics",
      transformIndexHtml: {
        order: "post",
        handler(html) {
          return html.replace("<!-- STARTUP_DIAGNOSTICS -->", () =>
            `<meta name="startup-variant" content="${variant}"><meta name="startup-version" content="${RELEASE_VERSION}">`
            + `<style>${readStartup("Startup.module.css")}</style>`
            + `<script>${readStartup("bootstrap.js").replace(/<\/script/gi, "<\\/script")}</script>`);
        },
      },
    }],
  };
});
