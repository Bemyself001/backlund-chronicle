import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sites } from "@openai/sites-vite-plugin";

export default defineConfig(({ command }) => ({
  plugins: [react(), sites()],
  ...(command === "serve" ? { optimizeDeps: { disabled: true } } : {}),
}));
