import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "@worker": path.resolve(root, "../src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
  },
  server: {
    port: 5173,
    // 开发时代理 Worker API 到本地 wrangler dev（默认 8787），保持和生产同源。
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/webhook": "http://127.0.0.1:8787",
    },
  },
});
