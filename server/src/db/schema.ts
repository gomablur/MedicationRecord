import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  googleSub: text("google_sub").unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  // 最終アクセス日時 (authMiddleware が 1 時間に 1 回だけ更新する目安値)
  lastSeenAt: text("last_seen_at"),
  createdAt: text("created_at").notNull().default(now),
});

/**
 * 調剤記録 (お薬手帳の 1 ページに相当)。
 * 1 回の調剤・処方につき 1 行で、薬は medications に紐づく。
 */
export const records = sqliteTable(
  "records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    // 調剤等年月日 (YYYY-MM-DD)。JAHIS レコード No.5 由来
    dispensedAt: text("dispensed_at").notNull(),
    // 調剤した薬局・医療機関 (JAHIS No.11)
    pharmacyName: text("pharmacy_name"),
    pharmacyPhone: text("pharmacy_phone"),
    // 処方した医療機関・医師 (JAHIS No.51 / No.55)
    hospitalName: text("hospital_name"),
    doctorName: text("doctor_name"),
    // 服用注意・備考など記録全体につくメモ (JAHIS No.401/411/421/501 や手入力)
    notes: text("notes"),
    source: text("source", { enum: ["manual", "qr"] }).notNull().default("manual"),
    // QR 取り込み時の生データ (再解釈やデバッグ用に保持)
    rawQr: text("raw_qr"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("records_user_dispensed_idx").on(t.userId, t.dispensedAt)],
);

/** 調剤記録内の薬 1 品目 (JAHIS No.201 + 同一 RP の No.301 を展開したもの) */
export const medications = sqliteTable(
  "medications",
  {
    id: text("id").primaryKey(),
    recordId: text("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    // RP 番号 (処方指示のまとまり)。手入力では null 可
    rpNumber: integer("rp_number"),
    name: text("name").notNull(),
    // 用量 (数値文字列) と単位。例: dose="3", doseUnit="錠"
    dose: text("dose"),
    doseUnit: text("dose_unit"),
    // 用法 (JAHIS No.301 用法名称)。例: "1日3回 毎食後服用"
    usageText: text("usage_text"),
    // 調剤数量と単位。例: quantity="14", quantityUnit="日分"
    quantity: text("quantity"),
    quantityUnit: text("quantity_unit"),
    // 剤形コード (JAHIS 別表4: 1:内服 2:内滴 3:屯服 4:注射 5:外用 6:浸煎薬 7:湯薬 9:材料 10:その他)
    doseFormCode: text("dose_form_code"),
    // 薬品補足・服用注意 (JAHIS No.281/291/311/391) や手入力メモ
    note: text("note"),
    genericName: text("generic_name"),
    drugCodeType: text("drug_code_type"),
    drugCode: text("drug_code"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("medications_record_idx").on(t.recordId)],
);
