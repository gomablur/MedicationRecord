#!/usr/bin/env node
// expo export -p web の後処理。
// web.output "single" (SPA) では +html.tsx が使われないため、dist/index.html に
// iOS「ホーム画面に追加」用の apple-touch-icon 等を直接注入する。
// (アイコン実体 public/apple-touch-icon.png は gen-icons.mjs が生成し、
//  export が public/ → dist/ へコピーする)
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const file = join(dist, "index.html");

let html = readFileSync(file, "utf8");
if (!html.includes("apple-touch-icon")) {
  html = html.replace(
    "</title>",
    `</title>\n    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />\n    <meta name="theme-color" content="#17634a" />`,
  );
}
html = html.replace('<html lang="en">', '<html lang="ja">');
writeFileSync(file, html);
console.log("✓ dist/index.html に apple-touch-icon / theme-color / lang=ja を注入しました");
