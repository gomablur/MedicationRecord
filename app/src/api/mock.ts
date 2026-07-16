import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Medication, QrParseResult, RecordInput, RecordWithMeds, User } from '@/api/types';

/**
 * お試しモード(モック)の実装。サーバーに一切アクセスせず、
 * 端末内 (AsyncStorage / localStorage) だけで全機能を動かす。
 * OAuth や D1 の設定が済んでいなくても UI を確認できるようにするためのもの。
 */

const MOCK_MODE_KEY = 'okusuri.mockMode';
const MOCK_RECORDS_KEY = 'okusuri.mockRecords';

/**
 * お試しモードの提供可否 (ビルド時の環境変数で縛る)。
 * EXPO_PUBLIC_ENABLE_MOCK=1 のビルドでのみログイン画面にボタンが出る。
 */
export const MOCK_ENABLED = process.env.EXPO_PUBLIC_ENABLE_MOCK === '1';

export const MOCK_USER: User = {
  id: 'mock-user',
  email: 'guest@example.com',
  name: 'ゲスト (お試しモード)',
};

let mockMode = false;
let records: RecordWithMeds[] | null = null;

export function isMockMode(): boolean {
  return mockMode;
}

/** 起動時に一度呼ぶ。前回のお試しモード状態を復元する (無効ビルドでは常に false) */
export async function loadMockMode(): Promise<boolean> {
  if (!MOCK_ENABLED) return false;
  mockMode = (await AsyncStorage.getItem(MOCK_MODE_KEY)) === '1';
  return mockMode;
}

export async function setMockMode(on: boolean): Promise<void> {
  if (on && !MOCK_ENABLED) throw new Error('お試しモードはこのビルドでは無効です');
  mockMode = on;
  if (on) {
    await AsyncStorage.setItem(MOCK_MODE_KEY, '1');
  } else {
    records = null;
    await AsyncStorage.multiRemove([MOCK_MODE_KEY, MOCK_RECORDS_KEY]);
  }
}

/** サンプルデータ (初回のみ投入) */
function seedRecords(): RecordWithMeds[] {
  const med = (
    id: string,
    input: Partial<Medication> & { name: string },
    sortOrder: number,
  ): Medication => ({
    id,
    rpNumber: null,
    dose: null,
    doseUnit: null,
    usageText: null,
    quantity: null,
    quantityUnit: null,
    doseFormCode: null,
    note: null,
    genericName: null,
    drugCodeType: null,
    drugCode: null,
    sortOrder,
    ...input,
  });
  const now = new Date().toISOString();
  return [
    {
      id: 'mock-rec-2',
      dispensedAt: '2026-07-01',
      pharmacyName: 'サンプル薬局 駅前店',
      pharmacyPhone: '03-1234-5678',
      hospitalName: 'サンプル内科クリニック',
      doctorName: '見本 太郎 (内科)',
      notes: '正しい飲み方は薬袋等をご覧ください。',
      source: 'qr',
      createdAt: now,
      updatedAt: now,
      medications: [
        med(
          'mock-med-3',
          {
            rpNumber: 1,
            name: 'サンプルロキソニン錠６０ｍｇ',
            dose: '3',
            doseUnit: '錠',
            usageText: '1日3回 毎食後服用',
            quantity: '7',
            quantityUnit: '日分',
            doseFormCode: '1',
          },
          0,
        ),
        med(
          'mock-med-4',
          {
            rpNumber: 2,
            name: 'サンプル湿布 ７ｃｍ×１０ｃｍ',
            dose: '14',
            doseUnit: '枚',
            usageText: '1日2回 患部に貼付',
            quantity: '1',
            quantityUnit: '調剤',
            doseFormCode: '5',
          },
          1,
        ),
      ],
    },
    {
      id: 'mock-rec-1',
      dispensedAt: '2026-06-10',
      pharmacyName: 'サンプル薬局 本店',
      pharmacyPhone: null,
      hospitalName: 'サンプル皮膚科',
      doctorName: null,
      notes: null,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
      medications: [
        med(
          'mock-med-1',
          {
            name: 'サンプル保湿クリーム',
            dose: '25',
            doseUnit: 'g',
            usageText: '1日2回 塗布',
            doseFormCode: '5',
          },
          0,
        ),
      ],
    },
  ];
}

async function loadRecords(): Promise<RecordWithMeds[]> {
  if (records) return records;
  const stored = await AsyncStorage.getItem(MOCK_RECORDS_KEY);
  if (stored) {
    try {
      records = JSON.parse(stored) as RecordWithMeds[];
      return records;
    } catch {
      // 壊れていたらシードし直す
    }
  }
  records = seedRecords();
  await persist();
  return records;
}

async function persist(): Promise<void> {
  if (records) await AsyncStorage.setItem(MOCK_RECORDS_KEY, JSON.stringify(records));
}

function sortRecords(list: RecordWithMeds[]): RecordWithMeds[] {
  return [...list].sort((a, b) =>
    a.dispensedAt === b.dispensedAt
      ? b.id.localeCompare(a.id)
      : b.dispensedAt.localeCompare(a.dispensedAt),
  );
}

function toRecord(id: string, input: RecordInput, createdAt?: string): RecordWithMeds {
  const now = new Date().toISOString();
  return {
    id,
    dispensedAt: input.dispensedAt,
    pharmacyName: input.pharmacyName ?? null,
    pharmacyPhone: input.pharmacyPhone ?? null,
    hospitalName: input.hospitalName ?? null,
    doctorName: input.doctorName ?? null,
    notes: input.notes ?? null,
    source: input.source ?? 'manual',
    createdAt: createdAt ?? now,
    updatedAt: now,
    medications: input.medications.map((m, i) => ({
      id: `${id}-med-${i}`,
      rpNumber: m.rpNumber ?? null,
      name: m.name,
      dose: m.dose ?? null,
      doseUnit: m.doseUnit ?? null,
      usageText: m.usageText ?? null,
      quantity: m.quantity ?? null,
      quantityUnit: m.quantityUnit ?? null,
      doseFormCode: m.doseFormCode ?? null,
      note: m.note ?? null,
      genericName: m.genericName ?? null,
      drugCodeType: m.drugCodeType ?? null,
      drugCode: m.drugCode ?? null,
      sortOrder: i,
    })),
  };
}

// ───────────── records API 互換の実装 ─────────────

export async function mockListRecords(q?: string): Promise<RecordWithMeds[]> {
  const list = await loadRecords();
  const query = q?.trim();
  if (!query) return sortRecords(list);
  return sortRecords(
    list.filter(
      (r) =>
        (r.pharmacyName ?? '').includes(query) ||
        (r.hospitalName ?? '').includes(query) ||
        (r.doctorName ?? '').includes(query) ||
        r.medications.some(
          (m) => m.name.includes(query) || (m.genericName ?? '').includes(query),
        ),
    ),
  );
}

export async function mockGetRecord(id: string): Promise<RecordWithMeds> {
  const list = await loadRecords();
  const record = list.find((r) => r.id === id);
  if (!record) throw new Error('記録が見つかりません');
  return record;
}

export async function mockCreateRecord(input: RecordInput): Promise<RecordWithMeds> {
  const list = await loadRecords();
  const record = toRecord(`mock-rec-${Date.now()}`, input);
  records = [...list, record];
  await persist();
  return record;
}

export async function mockUpdateRecord(id: string, input: RecordInput): Promise<RecordWithMeds> {
  const list = await loadRecords();
  const existing = list.find((r) => r.id === id);
  if (!existing) throw new Error('記録が見つかりません');
  const updated = toRecord(id, input, existing.createdAt);
  records = list.map((r) => (r.id === id ? updated : r));
  await persist();
  return updated;
}

export async function mockDeleteRecord(id: string): Promise<void> {
  const list = await loadRecords();
  records = list.filter((r) => r.id !== id);
  await persist();
}

/**
 * QR 解析の簡易版。本物の解析はサーバー (JAHIS パーサー) の仕事なので、
 * ここでは JAHIS らしい行 (201/301/5/11 など) から最低限を拾い、
 * 読めなければサンプルの下書きを返す。
 */
export async function mockParseQr(payloads: string[]): Promise<QrParseResult> {
  const text = payloads.join('\n');
  const lines = text.split(/\r\n|\r|\n/);
  const meds: RecordInput['medications'] = [];
  const usageByRp = new Map<string, { usageText?: string; quantity?: string; quantityUnit?: string }>();
  let dispensedAt: string | undefined;
  let pharmacyName: string | undefined;

  for (const line of lines) {
    const f = line.split(',');
    if (f[0] === '201' && f[2]) {
      meds.push({ rpNumber: Number(f[1]) || null, name: f[2], dose: f[3] || null, doseUnit: f[4] || null });
    } else if (f[0] === '301' && f[1]) {
      usageByRp.set(f[1], { usageText: f[2], quantity: f[3], quantityUnit: f[4] });
    } else if (f[0] === '5' && f[1] && /^\d{8}$/.test(f[1])) {
      dispensedAt = `${f[1].slice(0, 4)}-${f[1].slice(4, 6)}-${f[1].slice(6, 8)}`;
    } else if (f[0] === '11' && f[1]) {
      pharmacyName = f[1];
    }
  }
  for (const m of meds) {
    const usage = usageByRp.get(String(m.rpNumber ?? ''));
    if (usage) {
      m.usageText = usage.usageText || null;
      m.quantity = usage.quantity || null;
      m.quantityUnit = usage.quantityUnit || null;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  if (meds.length === 0) {
    // JAHIS として読めない入力 → サンプルの下書きで画面の流れを確認できるようにする
    return {
      status: 'ok',
      draft: {
        dispensedAt: today,
        pharmacyName: 'サンプル薬局 (お試しモード)',
        source: 'qr',
        notes: 'お試しモードのため、読み取り内容に関わらずサンプルを表示しています。',
        medications: [
          { name: 'サンプル薬A錠 １０ｍｇ', dose: '1', doseUnit: '錠', usageText: '1日1回 朝食後', quantity: '14', quantityUnit: '日分' },
        ],
      },
      memos: [],
    };
  }
  return {
    status: 'ok',
    draft: { dispensedAt: dispensedAt ?? today, pharmacyName: pharmacyName ?? null, source: 'qr', medications: meds },
    memos: [],
  };
}
