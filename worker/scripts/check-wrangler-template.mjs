// Pre-commit guard：worker/wrangler.jsonc（gitignored，含真实 ID）和
// worker/wrangler.example.jsonc（committed template）必须只差占位符替换。
//
// 用法：
//   bun worker/scripts/check-wrangler-template.mjs
//
// 行为：
//   - 没有 local wrangler.jsonc → 跳过（exit 0），打提示
//   - 两个文件除占位符替换外完全一致 → exit 0
//   - 不一致 → 打 diff，exit 1
//
// 占位符：例子里的 `${D1_DATABASE_ID}` 对应 local 里 `d1_databases[0].database_id`，
// `${KV_NAMESPACE_ID}` 对应 `kv_namespaces[0].id`。新加占位符要在下面 PLACEHOLDERS 里登记。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// "$" + "{X}" 拆开拼是为了绕开 biome `noTemplateCurlyInString`：我们 *要* 普通
// 字符串里的字面量 `${...}`（这是 envsubst 的占位符语法），不是 JS 模板字符串
const ph = (name) => `$\{${name}}`;
const PLACEHOLDERS = [
  { ph: ph("D1_DATABASE_ID"), at: ["d1_databases", 0, "database_id"] },
  { ph: ph("KV_NAMESPACE_ID"), at: ["kv_namespaces", 0, "id"] },
];

const here = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(here, "..");
const localPath = path.join(workerDir, "wrangler.jsonc");
const examplePath = path.join(workerDir, "wrangler.example.jsonc");

if (!fs.existsSync(localPath)) {
  console.log(
    "⚠️  worker/wrangler.jsonc 不存在 —— 跳过 template check（首次 setup 可能还没 cp）",
  );
  process.exit(0);
}

function stripJsonc(text) {
  // 去 /* */ block 注释 + // 行注释。我们的 wrangler.jsonc 没有 string
  // 里嵌 "/*" 这种 corner case，naive regex 够用
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function setAt(obj, pathArr, value) {
  let cur = obj;
  for (let i = 0; i < pathArr.length - 1; i++) {
    cur = cur?.[pathArr[i]];
    if (cur == null) return; // path 不存在就 silently skip（让 diff 自然报）
  }
  cur[pathArr.at(-1)] = value;
}

const local = JSON.parse(stripJsonc(fs.readFileSync(localPath, "utf8")));
const example = JSON.parse(stripJsonc(fs.readFileSync(examplePath, "utf8")));

// 把 local 里的真实 ID 全部替换回占位符，再跟 example 比
for (const { ph, at } of PLACEHOLDERS) setAt(local, at, ph);

const localStr = JSON.stringify(local, null, 2);
const exampleStr = JSON.stringify(example, null, 2);

if (localStr === exampleStr) {
  console.log(
    "✅ worker/wrangler.jsonc 与 wrangler.example.jsonc 一致（除占位符外）",
  );
  process.exit(0);
}

console.error(
  "❌ worker/wrangler.jsonc 跟 wrangler.example.jsonc 出现 drift。",
);
console.error("   要么把 example 同步成 local 的新字段（推荐），");
console.error("   要么把 local 改回跟 example 一致。\n");

// 简单 line-by-line diff
const aL = localStr.split("\n");
const eL = exampleStr.split("\n");
const max = Math.max(aL.length, eL.length);
let shown = 0;
for (let i = 0; i < max && shown < 30; i++) {
  if (aL[i] !== eL[i]) {
    console.error(`  L${i + 1}`);
    console.error(`    example: ${eL[i] ?? "(EOF)"}`);
    console.error(`    local:   ${aL[i] ?? "(EOF)"}`);
    shown++;
  }
}
if (shown === 30) console.error("  ... (more diff truncated)");

process.exit(1);
