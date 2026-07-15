import type { RecordInput } from '@/api/types';

/**
 * QR 解析結果を編集フォーム(record/new)へ渡すためのグローバル一時ストア。
 * 画面間の一往復だけの受け渡しなので、モジュールスコープ変数で十分。
 */

let draft: RecordInput | null = null;

export function setQrDraft(input: RecordInput): void {
  draft = input;
}

/** 取り出すと同時にクリアする(再訪時に古いドラフトが残らないように) */
export function consumeQrDraft(): RecordInput | null {
  const d = draft;
  draft = null;
  return d;
}
