// JAHIS お薬手帳 QR / 移行ファイルの解析エンドポイント。
// 解析結果は保存せず、RecordInput 互換の下書き (drafts) として返す。
// クライアントは内容をユーザーに確認させてから POST /api/records で保存する。
// 移行ファイル (複数データ・複数調剤) では drafts が複数件になる。
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { parseJahis, type JahisDispenseGroup } from "../jahis/parser";
import { qrParseSchema, type RecordInput } from "../schemas";
import type { AppEnv } from "../env";

/** 調剤グループ 1 つを保存用の入力 (RecordInput) に変換する */
function toDraft(group: JahisDispenseGroup, rawQr: string | null): RecordInput {
  const today = new Date().toISOString().slice(0, 10);
  return {
    dispensedAt: group.dispensedAt ?? today,
    pharmacyName: group.pharmacyName ?? null,
    pharmacyPhone: group.pharmacyPhone ?? null,
    hospitalName: group.hospitalName ?? null,
    doctorName: group.doctorName ?? null,
    notes: group.generalNotes.length > 0 ? group.generalNotes.join("\n") : null,
    source: "qr",
    rawQr,
    medications: group.medications.map((m) => ({
      rpNumber: m.rpNumber,
      name: m.name,
      dose: m.dose ?? null,
      doseUnit: m.doseUnit ?? null,
      usageText: m.usageText ?? null,
      quantity: m.quantity ?? null,
      quantityUnit: m.quantityUnit ?? null,
      doseFormCode: m.doseFormCode ?? null,
      note: m.notes.length > 0 ? m.notes.join("\n") : null,
      genericName: m.genericName ?? null,
      drugCodeType: m.drugCodeType ?? null,
      drugCode: m.drugCode ?? null,
    })),
  };
}

export const qrApp = new Hono<AppEnv>();

qrApp.post("/parse", zValidator("json", qrParseSchema), async (c) => {
  const { payloads } = c.req.valid("json");
  const result = parseJahis(payloads);

  if (result.status === "error") {
    return c.json({ error: result.error }, 400);
  }
  if (result.status === "needsMore") {
    return c.json({
      status: "needsMore" as const,
      splitId: result.splitId,
      total: result.total,
      received: result.received,
    });
  }

  const groups = result.datas.flatMap((d) => d.groups).filter((g) => g.medications.length > 0);
  if (groups.length === 0) {
    return c.json({ error: "薬品情報が含まれていません" }, 400);
  }
  // 生データの保持は単一記録のときだけ (移行の一括取り込みで全記録に同じ生データを
  // 重複保存するとテーブルが不必要に膨らむため)
  const rawQr = groups.length === 1 ? payloads.join("\n===JAHIS-PART===\n") : null;
  const memos = [...new Set(result.datas.flatMap((d) => d.memos))];
  return c.json({
    status: "ok" as const,
    drafts: groups.map((g) => toDraft(g, rawQr)),
    patientName: result.datas.find((d) => d.patientName)?.patientName,
    memos,
  });
});
