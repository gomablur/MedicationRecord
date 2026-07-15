// ローカル開発の前準備:
//   1. assets ディレクトリ (public/) がないと wrangler dev が起動できないためプレースホルダを作る
//      (本物の中身は Expo の web export。`npm run build:web` (リポジトリルート) で生成される)
//   2. .dev.vars がなければ .dev.vars.example からコピーする
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const publicDir = join(root, "public");
if (!existsSync(join(publicDir, "index.html"))) {
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(
    join(publicDir, "index.html"),
    "<!doctype html><meta charset='utf-8'><title>okusuri</title>" +
      "<p>Web UI は未ビルドです。リポジトリルートで <code>npm run build:web</code> を実行してください。</p>",
  );
}

const devVars = join(root, ".dev.vars");
if (!existsSync(devVars)) {
  copyFileSync(join(root, ".dev.vars.example"), devVars);
  console.log(".dev.vars を .dev.vars.example から作成しました");
}
