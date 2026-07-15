// 調剤記録の CRUD。すべて authMiddleware 通過後 (c.var.user / c.var.db が使える) 前提。
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { medications, records } from "../db/schema";
import { recordInputSchema, type RecordInput } from "../schemas";
import type { AppEnv } from "../env";
import { chunks, VAR_CHUNK } from "../util";

type Db = AppEnv["Variables"]["db"];
type RecordRow = typeof records.$inferSelect;
type MedicationRow = typeof medications.$inferSelect;

/** API レスポンス用: 記録 + 薬一覧 (rawQr は大きいので一覧・詳細とも返さない) */
function toApiRecord(row: RecordRow, meds: MedicationRow[]) {
  const { rawQr: _rawQr, userId: _userId, ...rest } = row;
  return {
    ...rest,
    medications: meds
      .filter((m) => m.recordId === row.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ recordId: _recordId, ...m }) => m),
  };
}

/** 記録 ID 群の薬を一括ロード (D1 の変数上限対策で分割) */
async function loadMedications(db: Db, recordIds: string[]): Promise<MedicationRow[]> {
  const out: MedicationRow[] = [];
  for (const ids of chunks(recordIds, VAR_CHUNK)) {
    out.push(...(await db.select().from(medications).where(inArray(medications.recordId, ids)).all()));
  }
  return out;
}

/** 薬の一括 INSERT (1 行あたりの変数 × 行数が上限を超えないよう分割) */
async function insertMedications(db: Db, recordId: string, input: RecordInput["medications"]) {
  const rows = input.map((m, i) => ({
    id: uuidv7(),
    recordId,
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
  }));
  const cols = Object.keys(rows[0] ?? {}).length || 1;
  for (const batch of chunks(rows, Math.max(1, Math.floor(VAR_CHUNK / cols)))) {
    await db.insert(medications).values(batch);
  }
}

async function getOwnedRecord(db: Db, userId: string, id: string): Promise<RecordRow | undefined> {
  return db
    .select()
    .from(records)
    .where(and(eq(records.id, id), eq(records.userId, userId)))
    .get();
}

export const recordsApp = new Hono<AppEnv>();

// 一覧 (調剤日降順)。?q= で薬名・薬局名・医療機関名を部分一致検索
recordsApp.get("/", async (c) => {
  const db = c.var.db;
  const userId = c.var.user.id;
  const q = c.req.query("q")?.trim();

  let rows = await db
    .select()
    .from(records)
    .where(eq(records.userId, userId))
    .orderBy(desc(records.dispensedAt), desc(records.id))
    .all();

  if (q) {
    const pattern = `%${q}%`;
    // 薬名ヒットの記録 ID を先に集める (相関サブクエリは Drizzle のハマりどころのため 2 段クエリ)
    const medHits = await db
      .selectDistinct({ recordId: medications.recordId })
      .from(medications)
      .where(or(like(medications.name, pattern), like(medications.genericName, pattern)))
      .all();
    const hitIds = new Set(medHits.map((r) => r.recordId));
    rows = rows.filter(
      (r) =>
        hitIds.has(r.id) ||
        (r.pharmacyName ?? "").includes(q) ||
        (r.hospitalName ?? "").includes(q) ||
        (r.doctorName ?? "").includes(q),
    );
  }

  const meds = await loadMedications(db, rows.map((r) => r.id));
  return c.json({ records: rows.map((r) => toApiRecord(r, meds)) });
});

// 作成 (手動追加・QR 取り込みの確定の両方で使う)
recordsApp.post("/", zValidator("json", recordInputSchema), async (c) => {
  const db = c.var.db;
  const input = c.req.valid("json");
  const id = uuidv7();

  await db.insert(records).values({
    id,
    userId: c.var.user.id,
    dispensedAt: input.dispensedAt,
    pharmacyName: input.pharmacyName ?? null,
    pharmacyPhone: input.pharmacyPhone ?? null,
    hospitalName: input.hospitalName ?? null,
    doctorName: input.doctorName ?? null,
    notes: input.notes ?? null,
    source: input.source,
    rawQr: input.rawQr ?? null,
  });
  await insertMedications(db, id, input.medications);

  const row = (await getOwnedRecord(db, c.var.user.id, id))!;
  const meds = await loadMedications(db, [id]);
  return c.json({ record: toApiRecord(row, meds) }, 201);
});

recordsApp.get("/:id", async (c) => {
  const row = await getOwnedRecord(c.var.db, c.var.user.id, c.req.param("id"));
  if (!row) return c.json({ error: "not found" }, 404);
  const meds = await loadMedications(c.var.db, [row.id]);
  return c.json({ record: toApiRecord(row, meds) });
});

// 更新 (薬リストは全置き換え)
recordsApp.put("/:id", zValidator("json", recordInputSchema), async (c) => {
  const db = c.var.db;
  const id = c.req.param("id");
  const existing = await getOwnedRecord(db, c.var.user.id, id);
  if (!existing) return c.json({ error: "not found" }, 404);

  const input = c.req.valid("json");
  await db
    .update(records)
    .set({
      dispensedAt: input.dispensedAt,
      pharmacyName: input.pharmacyName ?? null,
      pharmacyPhone: input.pharmacyPhone ?? null,
      hospitalName: input.hospitalName ?? null,
      doctorName: input.doctorName ?? null,
      notes: input.notes ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(records.id, id));
  await db.delete(medications).where(eq(medications.recordId, id));
  await insertMedications(db, id, input.medications);

  const row = (await getOwnedRecord(db, c.var.user.id, id))!;
  const meds = await loadMedications(db, [id]);
  return c.json({ record: toApiRecord(row, meds) });
});

recordsApp.delete("/:id", async (c) => {
  const db = c.var.db;
  const id = c.req.param("id");
  const existing = await getOwnedRecord(db, c.var.user.id, id);
  if (!existing) return c.json({ error: "not found" }, 404);

  // FK の cascade に頼らず明示的に消す (D1 の PRAGMA 設定に依存しないため)
  await db.delete(medications).where(eq(medications.recordId, id));
  await db.delete(records).where(eq(records.id, id));
  return c.json({ ok: true });
});
