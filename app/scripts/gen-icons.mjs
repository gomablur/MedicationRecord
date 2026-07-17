#!/usr/bin/env node
// アプリアイコン一式の生成(依存パッケージなし: RGBAバッファに描画してzlibでPNGエンコード)。
// 絵柄: 深緑グラデーションの背景 + 白いお守り(「お薬手帳は健康のお守り」のメタファー)。
// 再生成: `npm run icons`
//
// Android アダプティブアイコンの注意 (health-assistant から継承した知見):
//   - 108dp キャンバスのうち中央 72dp しか表示されず、ランチャーが切り出して拡大する。
//     iOS と絵の大きさを揃えるため、前景・モノクロームは 72/108 倍に縮小して描く
//   - 前景レイヤーのセーフゾーンは中心(50,50)・半径33の**円**。お守りの下端は中心から
//     36 だが、縮小後は 24 なので収まる
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
const MINT = [0xbf, 0xea, 0xd6]; // 紐・結び目・錦の帯

// ---- 幾何ヘルパー (論理座標 0-100) ----
const dseg = (x, y, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
};
const inRR = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

/**
 * お守りグリフ。論理座標 (0-100) の点の色を返す (グリフ外は null)。
 * 上から: 紐の輪 → 紐 → ひし形の結び目 → 面取りされた本体 (錦の帯2本)
 * mono=true のときは全て白 (Android のモノクロームレイヤー用)
 */
function omamoriGlyph(x, y, mono = false) {
  const accent = mono ? WHITE : MINT;
  const ringD = Math.hypot(x - 50, y - 15);
  const loop = ringD <= 6.5 && ringD >= 4; // 紐の輪
  const cord = dseg(x, y, 50, 20, 50, 30) <= 1.7; // 紐
  const knot = Math.abs(x - 50) + Math.abs(y - 33) <= 6.5; // 結び目 (ひし形)
  // 本体: 面取り台形 (肩、y36-52 で幅20→36) + 角丸矩形 (下半分)。
  // 角丸矩形は y52 以降に限定する — 上角の丸みが肩の斜面と干渉して
  // 輪郭にくびれが出るため (台形の終端幅 36 = 矩形の全幅で連続につながる)
  const inBody =
    (y >= 36 && y <= 52 && Math.abs(x - 50) <= 10 + 8 * ((y - 36) / 16)) ||
    (y >= 52 && inRR(x, y, 32, 36, 68, 86, 7));

  if (loop || cord || knot) return accent;
  if (inBody) {
    if (y >= 52 && y <= 55.5) return accent; // 錦の帯
    if (y >= 58.5 && y <= 62) return accent;
    return WHITE;
  }
  return null;
}

const ADAPTIVE_SCALE = 72 / 108;

/**
 * @param {number} size 出力ピクセル
 * @param {object} opts
 * @param {"gradient"|"transparent"|"rounded"} opts.bg 背景 (rounded=角丸グラデ、外は透明)
 * @param {boolean} opts.glyph お守りを描くか
 * @param {number} opts.scale グリフの縮尺 (中心 50,50 基準。Androidレイヤーは 72/108)
 * @param {boolean} opts.mono グリフを単色 (白) にするか
 */
function drawIcon(size, { bg = "gradient", glyph = true, scale = 1, mono = false } = {}) {
  const S = 4; // スーパーサンプリング
  const W = size * S;
  const buf = new Uint8Array(W * W * 4);
  const rr = 0.22 * W; // 角丸半径 (favicon 用)
  for (let py = 0; py < W; py++) {
    for (let px = 0; px < W; px++) {
      if (bg === "rounded") {
        const cx = Math.max(Math.abs(px - W / 2) - (W / 2 - rr), 0);
        const cy = Math.max(Math.abs(py - W / 2) - (W / 2 - rr), 0);
        if (cx * cx + cy * cy > rr * rr) continue; // 角丸の外は透明のまま
      }
      // 論理座標 (グリフはスケールを中心基準で適用)
      const x = 50 + ((px / W) * 100 - 50) / scale;
      const y = 50 + ((py / W) * 100 - 50) / scale;
      let c = glyph ? omamoriGlyph(x, y, mono) : null;
      if (!c && bg !== "transparent") {
        const t = py / W; // 上→下グラデーション
        c = [
          BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t,
          BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t,
          BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t,
        ];
      }
      if (!c) continue;
      const i = (py * W + px) * 4;
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
  // メインアイコン (iOS・ストア用): グラデ背景 + お守り
  ["icon.png", drawIcon(1024)],
  // Android adaptive icon: 背景=グラデのみ(全面ブリード) / 前景=お守りのみ(縮小して描く)
  ["android-icon-background.png", drawIcon(1024, { glyph: false })],
  ["android-icon-foreground.png", drawIcon(1024, { bg: "transparent", scale: ADAPTIVE_SCALE })],
  ["android-icon-monochrome.png", drawIcon(1024, { bg: "transparent", scale: ADAPTIVE_SCALE, mono: true })],
  // スプラッシュ: 背景色 (app.json) の上にお守りのみ
  ["splash-icon.png", drawIcon(512, { bg: "transparent" })],
  // Web favicon: 角丸スクエア
  ["favicon.png", drawIcon(64, { bg: "rounded" })],
];
for (const [name, png] of targets) {
  writeFileSync(join(IMAGES, name), png);
  console.log(`✓ assets/images/${name}`);
}
