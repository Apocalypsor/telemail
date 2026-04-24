import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const css = execSync("pnpm exec tailwindcss -i worker/styles.css --minify", {
  encoding: "utf-8",
});
writeFileSync(
  "worker/assets/tailwind.ts",
  `export const TAILWIND_CSS = ${JSON.stringify(css.trim())};\n`,
);
console.log(`tailwind.ts generated (${css.trim().length} bytes)`);
