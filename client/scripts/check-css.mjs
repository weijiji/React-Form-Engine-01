#!/usr/bin/env node
// ADR-0011 防回归守卫（工单 19）：共享控件裸类只允许定义在 client/src/components/
// 的 CSS Modules 里。任何一个页内样式表手抄 `.btn` / `.input` / `.icon-btn` /
// `.seg` / `.badge` 都会让本脚本以非零退出码失败。
//
// 共享类清单必须与 client/src/components/ 组件库保持同步——新增/重命名组件类名时，
// 同步更新下面的 SHARED_CLASSES。

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
const COMPONENTS_DIR = join(SRC, "components");

// 与组件库同步的共享裸类清单（ADR-0011）。
const SHARED_CLASSES = [
  "btn",
  "btn-primary",
  "btn-ghost",
  "btn-sm",
  "icon-btn",
  "seg",
  "input",
  "input-sm",
  "input-wrap",
  "badge",
  "badge-green",
  "badge-amber",
  "badge-gray",
  "badge-indigo",
];

// 允许在 components/ 之外保留全局裸类的文件（相对 src 的路径）：
//   - styles/global.css —— 设计令牌 + `.icon` 全局图标实用类（18px，非组件尺寸）。
const GLOBAL_OK = new Set(["styles/global.css"]);

const pattern = new RegExp(
  SHARED_CLASSES.map(
    (c) => `\\.${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
  ).join("|"),
);

/** Walk `dir` collecting `.css` files, skipping the components library. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (p === COMPONENTS_DIR) continue; // 组件库自带这些类，跳过。
      walk(p, out);
    } else if (name.endsWith(".css")) {
      out.push(p);
    }
  }
  return out;
}

let failed = false;
for (const file of walk(SRC)) {
  if (GLOBAL_OK.has(relative(SRC, file))) continue;
  const short = relative(process.cwd(), file);
  // 先剥离 CSS 注释，避免注释里提到这些类名造成误报。
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const match = css.match(pattern);
  if (match) {
    failed = true;
    const cls = match[0].replace(/^\./, "");
    console.error(
      `✗ ${short}: 出现共享裸类 ".${cls}" —— 应改用 client/src/components/ 组件库（ADR-0011）`,
    );
  }
}

if (failed) {
  console.error("\n共享控件裸类只允许定义在 client/src/components/ 的 CSS Modules 中。");
  process.exit(1);
}
console.log("✓ check:css —— 无共享裸类外泄（ADR-0011 守卫通过）");
