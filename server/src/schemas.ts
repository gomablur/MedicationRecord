import { z } from "zod";

// API 入力の Zod スキーマ。app/src/api/types.ts の手書き型と対応させる
// (クライアントは別パッケージのため型は共有せず手書き。変更時は両方直すこと)

export const medicationInputSchema = z.object({
  rpNumber: z.number().int().positive().nullish(),
  name: z.string().trim().min(1).max(200),
  dose: z.string().trim().max(20).nullish(),
  doseUnit: z.string().trim().max(20).nullish(),
  usageText: z.string().trim().max(200).nullish(),
  quantity: z.string().trim().max(20).nullish(),
  quantityUnit: z.string().trim().max(20).nullish(),
  doseFormCode: z.string().trim().max(4).nullish(),
  note: z.string().trim().max(1000).nullish(),
  genericName: z.string().trim().max(200).nullish(),
  drugCodeType: z.string().trim().max(4).nullish(),
  drugCode: z.string().trim().max(20).nullish(),
});

export const recordInputSchema = z.object({
  dispensedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式で指定してください"),
  pharmacyName: z.string().trim().max(200).nullish(),
  pharmacyPhone: z.string().trim().max(30).nullish(),
  hospitalName: z.string().trim().max(200).nullish(),
  doctorName: z.string().trim().max(200).nullish(),
  notes: z.string().trim().max(4000).nullish(),
  source: z.enum(["manual", "qr"]).default("manual"),
  rawQr: z.string().max(40000).nullish(),
  medications: z.array(medicationInputSchema).min(1).max(50),
});

export const qrParseSchema = z.object({
  // 分割 QR と移行ファイルの一括アップロードに対応するため複数ペイロードを受け付ける
  payloads: z.array(z.string().max(100000)).min(1).max(50),
});

export type RecordInput = z.infer<typeof recordInputSchema>;
export type MedicationInput = z.infer<typeof medicationInputSchema>;
