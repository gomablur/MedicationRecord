/**
 * JAHIS 電子版お薬手帳データフォーマット (Ver.2.x) のパーサー。
 * 仕様: JAHIS「電子版お薬手帳データフォーマット仕様書 Ver.2.5」(23-106)
 * 概要は docs/jahis-qr-format.md 参照。
 *
 * データはカンマ区切りレコードの改行連結で、先頭行が "JAHISTCnn,出力区分"。
 * 対応している入力の形:
 *   - 通常の QR 1 枚 (1 ペイロード = 1 データ)
 *   - 分割 QR (No.911 分割制御レコード)。全部そろうまで needsMore を返す
 *   - 複数データの一括入力 (データ移行のファイルアップロード想定)。
 *     ペイロードごとに独立したデータとして解析する
 *   - 1 データ内に複数の調剤 (No.5 調剤等年月日が複数)。調剤ごとにグループ分割する
 */

/** 薬 1 品目 (No.201) + 同一 RP 番号の用法 (No.301) を展開したもの */
export type JahisMedication = {
  rpNumber: number | null;
  name: string;
  dose?: string;
  doseUnit?: string;
  drugCodeType?: string;
  drugCode?: string;
  genericName?: string;
  usageText?: string;
  quantity?: string;
  quantityUnit?: string;
  doseFormCode?: string;
  /** 薬品補足 (281)・薬品服用注意 (291)・用法補足 (311)・処方服用注意 (391) */
  notes: string[];
};

/** 1 回の調剤 (No.5 で区切られるグループ)。アプリの「記録」1 件に対応する */
export type JahisDispenseGroup = {
  /** 調剤等年月日 (No.5) を YYYY-MM-DD に正規化したもの */
  dispensedAt?: string;
  /** 調剤した薬局・医療機関 (No.11) */
  pharmacyName?: string;
  pharmacyPhone?: string;
  /** 調剤した医師・薬剤師 (No.15) */
  dispenserName?: string;
  /** 処方した医療機関 (No.51) */
  hospitalName?: string;
  /** 処方医 (No.55)。複数いる場合は「、」で連結 */
  doctorName?: string;
  medications: JahisMedication[];
  /** 服用注意 (401)・医療機関等提供情報 (411)・残薬確認 (421)・備考 (501) */
  generalNotes: string[];
};

/** 1 つの JAHIS データ (= 1 QR または 1 ファイル) */
export type JahisData = {
  /** JAHISTCnn の nn (バージョン番号) */
  version: number;
  /** 1: 医療機関→患者、2: 患者→医療機関 */
  outputType?: number;
  patientName?: string;
  /** 手帳メモ (4)・患者等記入 (601)・患者特記 (2) */
  memos: string[];
  /** 調剤グループ (通常の QR は 1 つ。移行データは複数になりうる) */
  groups: JahisDispenseGroup[];
};

export type JahisParseResult =
  | { status: "ok"; datas: JahisData[] }
  | {
      /** 分割データの一部のみ受信。total 個そろうまで追加スキャンが必要 */
      status: "needsMore";
      splitId: string;
      total: number;
      received: number[];
    }
  | { status: "error"; error: string };

/** 和暦年号 → 元年の西暦 (JAHIS 別表1 年号区分コード) */
const ERA_BASE: Record<string, number> = {
  M: 1868, // 明治
  T: 1912, // 大正
  S: 1926, // 昭和
  H: 1989, // 平成
  R: 2019, // 令和
};

/** JAHIS の年月日 (YYYYMMDD または 和暦 GYYMMDD) を YYYY-MM-DD へ。不正なら undefined */
export function parseJahisDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  let y: number, m: number, d: number;
  if (/^\d{8}$/.test(s)) {
    y = Number(s.slice(0, 4));
    m = Number(s.slice(4, 6));
    d = Number(s.slice(6, 8));
  } else if (/^[MTSHR]\d{6}$/.test(s)) {
    const base = ERA_BASE[s[0]!]!;
    y = base + Number(s.slice(1, 3)) - 1;
    m = Number(s.slice(3, 5));
    d = Number(s.slice(5, 7));
  } else {
    return undefined;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

type Row = string[];

/** 1 データ分のテキストをレコード行の配列へ。BOM・空行は除去 */
function toRows(payload: string): Row[] {
  return payload
    .replace(/^﻿/, "")
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(","));
}

const VERSION_RE = /^JAHISTC(\d{2})$/;

/**
 * QR ペイロード群 (またはアップロードされたファイル内容群) を解析する。
 * - 分割データ (No.911) は同一 ID でグルーピングし、そろっていなければ needsMore
 * - 分割でないペイロードはそれぞれ独立した 1 データとして解析する
 * - 同一ペイロードの重複は無視する
 */
export function parseJahis(payloads: string[]): JahisParseResult {
  const unique = [...new Set(payloads.map((p) => p.trim()).filter((p) => p.length > 0))];
  if (unique.length === 0) return { status: "error", error: "データが空です" };

  type Part = { rows: Row[]; version: number; outputType?: number; split?: { id: string; total: number; seq: number } };
  const standalone: Part[] = [];
  const splitGroups = new Map<string, Part[]>();

  for (const payload of unique) {
    const rows = toRows(payload);
    const header = rows[0];
    const versionMatch = header?.[0]?.match(VERSION_RE);
    if (!header || !versionMatch) {
      return { status: "error", error: "JAHIS お薬手帳のデータではありません (JAHISTC ヘッダーがありません)" };
    }
    const part: Part = {
      rows: rows.slice(1),
      version: Number(versionMatch[1]),
      outputType: header[1] ? Number(header[1]) : undefined,
    };
    const splitRow = part.rows.find((r) => r[0] === "911");
    if (splitRow) {
      const [, id, total, seq] = splitRow;
      if (!id || !total || !seq) return { status: "error", error: "分割制御レコード (911) が不正です" };
      part.split = { id, total: Number(total), seq: Number(seq) };
      part.rows = part.rows.filter((r) => r[0] !== "911");
      const group = splitGroups.get(id) ?? [];
      group.push(part);
      splitGroups.set(id, group);
    } else {
      standalone.push(part);
    }
  }

  // 分割グループを検証・結合。そろっていないものがあれば needsMore
  const documents: Part[] = [];
  for (const [splitId, parts] of splitGroups) {
    const total = parts[0]!.split!.total;
    const bySeq = new Map(parts.map((p) => [p.split!.seq, p]));
    const received = [...bySeq.keys()].sort((a, b) => a - b);
    if (received.length < total) {
      return { status: "needsMore", splitId, total, received };
    }
    documents.push({
      rows: received.flatMap((seq) => bySeq.get(seq)!.rows),
      version: parts[0]!.version,
      outputType: parts[0]!.outputType,
    });
  }
  documents.push(...standalone);

  const datas = documents.map((doc) => interpret(doc.rows, doc.version, doc.outputType));
  if (datas.every((d) => d.groups.every((g) => g.medications.length === 0))) {
    return { status: "error", error: "薬品情報が含まれていません" };
  }
  return { status: "ok", datas };
}

/** レコード行の配列を JahisData に組み立てる。No.5 (調剤等年月日) ごとにグループ分割する */
function interpret(rows: Row[], version: number, outputType: number | undefined): JahisData {
  const data: JahisData = { version, outputType, memos: [], groups: [] };

  const newGroup = (): JahisDispenseGroup => ({ medications: [], generalNotes: [] });
  // No.5 より前に調剤系レコードが来る非標準データも受けられるよう、遅延生成にする
  let group: JahisDispenseGroup | null = null;
  const current = (): JahisDispenseGroup => {
    if (!group) {
      group = newGroup();
      data.groups.push(group);
    }
    return group;
  };

  // RP 番号 → その RP に属する薬 (グループ内でのみ有効。No.5 でリセット)
  let medsByRp = new Map<number, JahisMedication[]>();
  let doctors: string[] = [];

  const closeGroup = () => {
    if (group && doctors.length > 0) group.doctorName = doctors.join("、");
    medsByRp = new Map();
    doctors = [];
    group = null;
  };

  const field = (row: Row, i: number): string | undefined => {
    const v = row[i]?.trim();
    return v ? v : undefined;
  };

  for (const row of rows) {
    switch (row[0]) {
      case "1": // 患者情報: 氏名,性別,生年月日,郵便番号,住所,電話,緊急連絡先,血液型,体重,氏名カナ
        data.patientName ??= field(row, 1);
        break;
      case "2": {
        // 患者特記: 種別(1:アレルギー歴 2:副作用歴 3:既往歴 9:その他),内容,作成者
        const kind = { "1": "アレルギー歴", "2": "副作用歴", "3": "既往歴" }[row[1] ?? ""] ?? "特記";
        const body = field(row, 2);
        if (body) data.memos.push(`${kind}: ${body}`);
        break;
      }
      case "4": {
        // 手帳メモ: メモ,入力年月日,作成者
        const memo = field(row, 1);
        if (memo) data.memos.push(memo);
        break;
      }
      case "5": // 調剤等年月日: 年月日,作成者 — ここから新しい調剤グループ
        closeGroup();
        current().dispensedAt = parseJahisDate(row[1]);
        break;
      case "11": // 調剤-医療機関等: 名称,都道府県,点数表,コード,郵便番号,住所,電話,作成者
        current().pharmacyName ??= field(row, 1);
        current().pharmacyPhone ??= field(row, 7);
        break;
      case "15": // 調剤-医師・薬剤師: 氏名,連絡先,作成者
        current().dispenserName ??= field(row, 1);
        break;
      case "51": // 処方-医療機関: 名称,都道府県,点数表,コード,作成者
        current().hospitalName ??= field(row, 1);
        break;
      case "55": {
        // 処方-医師: 氏名,診療科,作成者 (グループ内に複数回出現しうる)
        const name = field(row, 1);
        const dept = field(row, 2);
        if (name) doctors.push(dept ? `${name} (${dept})` : name);
        break;
      }
      case "201": {
        // 薬品: RP番号,名称,用量,単位,薬品コード種別,薬品コード,作成者,一般名,一般名コード種別,一般名コード
        const rp = row[1] ? Number(row[1]) : null;
        const med: JahisMedication = {
          rpNumber: Number.isFinite(rp) ? rp : null,
          name: field(row, 2) ?? "(名称不明)",
          dose: field(row, 3),
          doseUnit: field(row, 4),
          drugCodeType: field(row, 5),
          drugCode: field(row, 6),
          genericName: field(row, 8),
          notes: [],
        };
        current().medications.push(med);
        if (med.rpNumber !== null) {
          const list = medsByRp.get(med.rpNumber) ?? [];
          list.push(med);
          medsByRp.set(med.rpNumber, list);
        }
        break;
      }
      case "281": // 薬品補足: RP番号,補足,作成者
      case "291": { // 薬品服用注意: RP番号,内容,作成者
        const note = field(row, 2);
        const rp = Number(row[1]);
        if (note) for (const med of medsByRp.get(rp) ?? []) med.notes.push(note);
        break;
      }
      case "301": {
        // 用法: RP番号,用法名称,調剤数量,調剤単位,剤形コード,用法コード種別,用法コード,作成者
        const rp = Number(row[1]);
        for (const med of medsByRp.get(rp) ?? []) {
          med.usageText ??= field(row, 2);
          med.quantity ??= field(row, 3);
          med.quantityUnit ??= field(row, 4);
          med.doseFormCode ??= field(row, 5);
        }
        break;
      }
      case "311": // 用法補足: RP番号,補足,作成者
      case "391": { // 処方服用注意: RP番号,内容,作成者
        const note = field(row, 2);
        const rp = Number(row[1]);
        if (note) for (const med of medsByRp.get(rp) ?? []) med.notes.push(note);
        break;
      }
      case "401": // 服用注意: 内容,作成者
      case "421": // 残薬確認: 内容,作成者
      case "501": { // 備考: 内容,作成者
        const note = field(row, 1);
        if (note) current().generalNotes.push(note);
        break;
      }
      case "411": { // 医療機関等提供情報: 内容,提供情報種別,作成者
        const note = field(row, 1);
        if (note) current().generalNotes.push(note);
        break;
      }
      case "601": { // 患者等記入: 内容,入力年月日
        const note = field(row, 1);
        if (note) data.memos.push(note);
        break;
      }
      // 3/31 (要指導・一般用医薬品), 701 (かかりつけ薬剤師) などは現状スキップ
      default:
        break;
    }
  }
  closeGroup();

  // 薬のない空グループ (メモだけのデータ等) は落とす
  data.groups = data.groups.filter((g) => g.medications.length > 0 || g.generalNotes.length > 0);
  return data;
}

/** 剤形コード (別表4) の表示名 */
export const DOSE_FORM_LABELS: Record<string, string> = {
  "1": "内服",
  "2": "内滴",
  "3": "屯服",
  "4": "注射",
  "5": "外用",
  "6": "浸煎薬",
  "7": "湯薬",
  "9": "材料",
  "10": "その他",
};
