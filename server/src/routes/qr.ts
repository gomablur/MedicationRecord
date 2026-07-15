// JAHIS お薬手帳 QR の解析エンドポイント。
// 解析結果は保存せず、RecordInput 互換の下書き (draft) として返す。
// クライアントは内容をユーザーに確認させてから POST /api/records で保存する。
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { parseJahis, type JahisData } from "../jahis/parser";
import { qrParseSchema, type RecordInput } from "../schemas";
import type { AppEnv } from "../env";

/** 解析結果を保存用の入力 (RecordInput) に変換する */
function toDraft(data: JahisData, payloads: string[]): RecordInput {
  const today = new Date().toISOString().slice(0, 10);
  return {
    dispensedAt: data.dispensedAt ?? today,
    pharmacyName: data.pharmacyName ?? null,
    pharmacyPhone: data.pharmacyPhone ?? null,
    hospitalName: data.hospitalName ?? null,
    doctorName: data.doctorName ?? null,
    notes: data.generalNotes.length > 0 ? data.generalNotes.join("\n") : null,
    source: "qr",
    rawQr: payloads.join("\n===JAHIS-PART===\n"),
    medications: data.medications.map((m) => ({
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
  if (result.data.medications.length === 0) {
    return c.json({ error: "QR に薬品情報が含まれていません" }, 400);
  }
  return c.json({
    status: "ok" as const,
    draft: toDraft(result.data, payloads),
    patientName: result.data.patientName,
    memos: result.data.memos,
  });
});
