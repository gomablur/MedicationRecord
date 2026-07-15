#!/usr/bin/env node
// プレースホルダアプリアイコンの生成(依存パッケージなし)。
// 絵柄: 深緑の背景に白い十字(薬局マーク)+カプセル型の窓。凝らない方針。
// 再生成: `npm run icons`
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const IMAGES = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "images");
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

const BG = [0x1f, 0x7a, 0x5c]; // 深緑(theme.ts の tintFill と同系)
const FG = [0xff, 0xff, 0xff];

/**
 * @param {number} size 出力ピクセル
 * @param {boolean} rounded 角丸(favicon 用)。角丸の外は透明
 */
function drawIcon(size, rounded = false) {
  const S = 4; // スーパーサンプリング
  const W = size * S;
  const buf = new Uint8Array(W * W * 4);
  const armHw = 0.11; // 十字の腕の半幅(論理 0-1)
  const armLen = 0.30; // 十字の腕の長さ(中心から)
  const rr = 0.22; // 角丸半径
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const lx = x / W - 0.5;
      const ly = y / W - 0.5;
      // 角丸判定
      if (rounded) {
        const cx = Math.max(Math.abs(lx) - (0.5 - rr), 0);
        const cy = Math.max(Math.abs(ly) - (0.5 - rr), 0);
        if (cx * cx + cy * cy > rr * rr) continue; // 透明のまま
      }
      const cross =
        (Math.abs(lx) <= armHw && Math.abs(ly) <= armLen) ||
        (Math.abs(ly) <= armHw && Math.abs(lx) <= armLen);
      const c = cross ? FG : BG;
      const i = (y * W + x) * 4;
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      buf[i + 3] = 255;
    }
  }
  // ダウンサンプリング(アルファ加重平均。透明縁の黒フリンジ防止)
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

writeFileSync(join(IMAGES, "icon.png"), drawIcon(1024));
writeFileSync(join(IMAGES, "favicon.png"), drawIcon(64, true));
console.log("✓ assets/images/icon.png, favicon.png を生成しました");
