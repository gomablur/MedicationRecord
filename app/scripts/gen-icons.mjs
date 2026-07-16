#!/usr/bin/env node
// アプリアイコン一式の生成(依存パッケージなし: RGBAバッファに描画してzlibでPNGエンコード)。
// 絵柄: 深緑グラデーションの背景 + 白い十字(薬局マーク)。再生成: `npm run icons`
//
// Android アダプティブアイコンの注意 (health-assistant から継承した知見):
//   - 108dp キャンバスのうち中央 72dp しか表示されず、ランチャーが切り出して拡大する。
//     iOS と絵の大きさを揃えるため、前景・モノクロームは 72/108 倍に縮小して描く
//   - 前景レイヤーのセーフゾーンは中心(50,50)・半径33の**円**。はみ出すとマスク形状に
//     よっては切れる (十字は最遠点 ≈ 32 で、縮小後はさらに余裕がある)
//   - 透明背景レイヤーのダウンサンプリングは**アルファ加重平均**にする。単純平均だと
//     透明ピクセルの黒が混ざり、グリフの縁に黒いフリンジが出る
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGES = join(ROOT, "assets", "images");
mkdirSync(IMAGES, { recursive: true });

// ---- 最小PNGエンコーダ ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // フィルタなし
    rgba.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- 色 (theme.ts の tintFill 系) ----
const BG_TOP = [0x27, 0x8a, 0x69]; // 上: 少し明るい緑
const BG_BOTTOM = [0x17, 0x63, 0x4a]; // 下: 深い緑
const WHITE = [0xff, 0xff, 0xff];

// ---- 十字の形状 (論理座標: 中心0、半径0.5 の正方形) ----
const CROSS = { armHw: 0.11, armLen: 0.3 }; // 半幅・腕の長さ。最遠点 ≈ 0.32 (セーフゾーン0.33内)
const ADAPTIVE_SCALE = 72 / 108;

/**
 * @param {number} size 出力ピクセル
 * @param {object} opts
 * @param {"gradient"|"transparent"|"rounded"} opts.bg 背景 (rounded=角丸グラデ、外は透明)
 * @param {boolean} opts.cross 十字を描くか
 * @param {number} opts.scale 十字の縮尺 (Androidレイヤーは 72/108)
 */
function drawIcon(size, { bg = "gradient", cross = true, scale = 1 } = {}) {
  const S = 4; // スーパーサンプリング
  const W = size * S;
  const buf = new Uint8Array(W * W * 4);
  const rr = 0.22; // 角丸半径 (favicon 用)
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const lx = x / W - 0.5;
      const ly = y / W - 0.5;
      if (bg === "rounded") {
        const cx = Math.max(Math.abs(lx) - (0.5 - rr), 0);
        const cy = Math.max(Math.abs(ly) - (0.5 - rr), 0);
        if (cx * cx + cy * cy > rr * rr) continue; // 角丸の外は透明のまま
      }
      const inCross =
        cross &&
        ((Math.abs(lx) <= CROSS.armHw * scale && Math.abs(ly) <= CROSS.armLen * scale) ||
          (Math.abs(ly) <= CROSS.armHw * scale && Math.abs(lx) <= CROSS.armLen * scale));
      let c = null;
      if (inCross) {
        c = WHITE;
      } else if (bg !== "transparent") {
        const t = y / W; // 上→下グラデーション
        c = [
          BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t,
          BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t,
          BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t,
        ];
      }
      if (!c) continue;
      const i = (y * W + x) * 4;
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      buf[i + 3] = 255;
    }
  }
  // ダウンサンプリング (アルファ加重平均)
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < S; dy++) {
        for (let dx = 0; dx < S; dx++) {
          const i = ((y * S + dy) * W + x * S + dx) * 4;
          const w = buf[i + 3];
          r += buf[i] * w;
          g += buf[i + 1] * w;
          b += buf[i + 2] * w;
          a += w;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
      }
      out[o + 3] = a / (S * S);
    }
  }
  return encodePng(out, size);
}

// ---- 出力 (Expo の構成に合わせる) ----
const targets = [
  // メインアイコン (iOS・ストア用): グラデ背景 + 十字
  ["icon.png", drawIcon(1024)],
  // Android adaptive icon: 背景=グラデのみ(全面ブリード) / 前景=十字のみ(縮小して描く)
  ["android-icon-background.png", drawIcon(1024, { cross: false })],
  ["android-icon-foreground.png", drawIcon(1024, { bg: "transparent", scale: ADAPTIVE_SCALE })],
  ["android-icon-monochrome.png", drawIcon(1024, { bg: "transparent", scale: ADAPTIVE_SCALE })],
  // スプラッシュ: 背景色 (app.json) の上に白十字のみ
  ["splash-icon.png", drawIcon(512, { bg: "transparent" })],
  // Web favicon: 角丸スクエア
  ["favicon.png", drawIcon(64, { bg: "rounded" })],
];
for (const [name, png] of targets) {
  writeFileSync(join(IMAGES, name), png);
  console.log(`✓ assets/images/${name}`);
}
