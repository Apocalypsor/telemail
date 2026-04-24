import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const css = execSync("pnpm exec tailwindcss -i worker/styles.css --minify", {
  encoding: "utf-8",
});
// worker/assets/ 里 tracked 的源文件早就清干净了，只剩这个 generated
// tailwind.ts。git 不 track 空目录，CI clone 出来根本没这个目录 ——
// 先 mkdirSync 保证 parent 存在再写。
mkdirSync("worker/assets", { recursive: true });
writeFileSync(
  "worker/assets/tailwind.ts",
  `export const TAILWIND_CSS = ${JSON.stringify(css.trim())};\n`,
);
console.log(`tailwind.ts generated (${css.trim().length} bytes)`);
