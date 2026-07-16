/**
 * API の型定義(手書き)。server/src/schemas.ts の Zod スキーマと
 * server/src/db/schema.ts が正。サーバー側を変更したらここも直すこと。
 */

export type User = {
  id: string;
  email: string;
  name: string;
};

export type Medication = {
  id: string;
  rpNumber: number | null;
  name: string;
  dose: string | null;
  doseUnit: string | null;
  usageText: string | null;
  quantity: string | null;
  quantityUnit: string | null;
  doseFormCode: string | null;
  note: string | null;
  genericName: string | null;
  drugCodeType: string | null;
  drugCode: string | null;
  sortOrder: number;
};

export type RecordWithMeds = {
  id: string;
  dispensedAt: string; // YYYY-MM-DD
  pharmacyName: string | null;
  pharmacyPhone: string | null;
  hospitalName: string | null;
  doctorName: string | null;
  notes: string | null;
  source: 'manual' | 'qr';
  createdAt: string;
  updatedAt: string;
  medications: Medication[];
};

export type MedicationInput = {
  rpNumber?: number | null;
  name: string;
  dose?: string | null;
  doseUnit?: string | null;
  usageText?: string | null;
  quantity?: string | null;
  quantityUnit?: string | null;
  doseFormCode?: string | null;
  note?: string | null;
  genericName?: string | null;
  drugCodeType?: string | null;
  drugCode?: string | null;
};

export type RecordInput = {
  dispensedAt: string;
  pharmacyName?: string | null;
  pharmacyPhone?: string | null;
  hospitalName?: string | null;
  doctorName?: string | null;
  notes?: string | null;
  source?: 'manual' | 'qr';
  rawQr?: string | null;
  medications: MedicationInput[];
};

/** POST /api/qr/parse のレスポンス(200 のバリエーション)。
 * 移行ファイル(複数データ・複数調剤)では drafts が複数件になる */
export type QrParseResult =
  | { status: 'ok'; drafts: RecordInput[]; patientName?: string; memos: string[] }
  | { status: 'needsMore'; splitId: string; total: number; received: number[] };
