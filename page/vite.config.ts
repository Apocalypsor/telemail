import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * 单 entry bundle —— web 页面和 Mini App 共用 `index.html` / `main.tsx`。
 * Mini App 专属路由 `/telegram-app/*` 和 web 路由共存在一棵 routeTree，
 * Pages `_redirects` 把所有 SPA 路径都 rewrite 到 `/index.html`。
 */
export default defineConfig({
  // router 插件必须排在 react 插件之前，才能把 routeTree 的生成和 Fast Refresh 串起来
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "@api": path.resolve(root, "src/api"),
      "@components": path.resolve(root, "src/components"),
      "@hooks": path.resolve(root, "src/hooks"),
      "@providers": path.resolve(root, "src/providers"),
      "@routes": path.resolve(root, "src/routes"),
      "@styles": path.resolve(root, "src/styles"),
      "@utils": path.resolve(root, "src/utils"),
      "@page": path.resolve(root, "src"),
      "@worker": path.resolve(root, "../worker"),
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
