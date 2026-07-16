import { describe, expect, it } from "vitest";
import { parseJahis, parseJahisDate } from "./parser";

// 仕様書 (Ver.2.5) の有効レコード出力サンプルをベースにしたテストデータ
const FULL = [
  "JAHISTC08,1",
  "1,鈴木 太郎,1,19580303,,,,,,",
  "5,R020410,1",
  "11,株式会社 工業会薬局 駅前店,13,4,1234567,,東京都港区新橋1丁目11番,03-3456-3456,1",
  "15,薬剤師 太郎,,1",
  "51,医療法人 工業会病院,13,1,1234567,1",
  "55,工業会 次郎,内科,1",
  "201,1,コリオパンカプセル5mg,6,Ｃ,2,620004992,1,,,",
  "201,1,フェロベリン配合錠,6,錠,2,620425801,1,,,",
  "301,1,【分３ 毎食後服用】,5,日分,1,1,,1",
  "281,1,一包化,1",
  "201,2,モーラステープ２０ｍｇ,7,枚,2,620007805,1,,,",
  "301,2,【患部に貼付】,1,調剤,5,1,,1",
  "391,2,車の運転は控えてください。,1",
  "401,他の薬を併用する際は、相談してください。,1",
  "501,正しい飲み方は薬袋等をご覧下さい。,1",
].join("\r\n");

describe("parseJahisDate", () => {
  it("西暦8桁を YYYY-MM-DD にする", () => {
    expect(parseJahisDate("20160411")).toBe("2016-04-11");
  });
  it("和暦 (昭和・平成・令和) を西暦にする", () => {
    expect(parseJahisDate("S330303")).toBe("1958-03-03");
    expect(parseJahisDate("H280411")).toBe("2016-04-11");
    expect(parseJahisDate("R020410")).toBe("2020-04-10");
  });
  it("不正な値は undefined", () => {
    expect(parseJahisDate("")).toBeUndefined();
    expect(parseJahisDate("2016041")).toBeUndefined();
    expect(parseJahisDate("X330303")).toBeUndefined();
    expect(parseJahisDate("20161341")).toBeUndefined();
  });
});

describe("parseJahis (単一データ)", () => {
  it("仕様書サンプル相当のデータを解析できる", () => {
    const result = parseJahis([FULL]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.datas).toHaveLength(1);
    const d = result.datas[0]!;
    expect(d.version).toBe(8);
    expect(d.outputType).toBe(1);
    expect(d.patientName).toBe("鈴木 太郎");
    expect(d.groups).toHaveLength(1);
    const g = d.groups[0]!;
    expect(g.dispensedAt).toBe("2020-04-10");
    expect(g.pharmacyName).toBe("株式会社 工業会薬局 駅前店");
    expect(g.pharmacyPhone).toBe("03-3456-3456");
    expect(g.dispenserName).toBe("薬剤師 太郎");
    expect(g.hospitalName).toBe("医療法人 工業会病院");
    expect(g.doctorName).toBe("工業会 次郎 (内科)");

    expect(g.medications).toHaveLength(3);
    const [m1, m2, m3] = g.medications;
    expect(m1!.name).toBe("コリオパンカプセル5mg");
    expect(m1!.dose).toBe("6");
    expect(m1!.doseUnit).toBe("Ｃ");
    expect(m1!.usageText).toBe("【分３ 毎食後服用】");
    expect(m1!.quantity).toBe("5");
    expect(m1!.quantityUnit).toBe("日分");
    expect(m1!.doseFormCode).toBe("1");
    expect(m1!.notes).toContain("一包化");
    // 同一 RP の 2 剤目にも用法・補足が展開される
    expect(m2!.usageText).toBe("【分３ 毎食後服用】");
    expect(m2!.notes).toContain("一包化");
    // RP2 (外用)
    expect(m3!.rpNumber).toBe(2);
    expect(m3!.usageText).toBe("【患部に貼付】");
    expect(m3!.doseFormCode).toBe("5");
    expect(m3!.notes).toContain("車の運転は控えてください。");

    expect(g.generalNotes).toEqual([
      "他の薬を併用する際は、相談してください。",
      "正しい飲み方は薬袋等をご覧下さい。",
    ]);
  });

  it("薬品コード・一般名を読み取る", () => {
    const payload = [
      "JAHISTC08,1",
      "5,20160411,1",
      "201,1,ノルバスク錠２．５ｍｇ,1,錠,2,612170709,1,【般】アムロジピン錠２．５ｍｇ,2,2171022F1ZZZ",
      "301,1,毎食後服用,3,日分,1,1,,1",
    ].join("\n");
    const result = parseJahis([payload]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const m = result.datas[0]!.groups[0]!.medications[0]!;
    expect(m.drugCodeType).toBe("2");
    expect(m.drugCode).toBe("612170709");
    expect(m.genericName).toBe("【般】アムロジピン錠２．５ｍｇ");
  });

  it("JAHIS ヘッダーがないデータはエラー", () => {
    const result = parseJahis(["https://example.com/totally-different-qr"]);
    expect(result.status).toBe("error");
  });

  it("空入力・薬品なしはエラー", () => {
    expect(parseJahis([]).status).toBe("error");
    expect(parseJahis(["", "  "]).status).toBe("error");
    expect(parseJahis(["JAHISTC08,1\n1,鈴木 太郎,1,19580303,,,,,,"]).status).toBe("error");
  });
});

describe("parseJahis (分割 QR)", () => {
  const part1 = [
    "JAHISTC08,1",
    "1,鈴木 太郎,1,19580303,,,,,,",
    "5,R020410,1",
    "201,1,コリオパンカプセル5mg,6,Ｃ,2,620004992,1,,,",
    "911,12345678901234,2,1",
  ].join("\r\n");
  const part2 = [
    "JAHISTC08,1",
    "301,1,【分３ 毎食後服用】,5,日分,1,1,,1",
    "501,正しい飲み方は薬袋等をご覧下さい。,1",
    "911,12345678901234,2,2",
  ].join("\r\n");

  it("1 枚目だけなら needsMore、2 枚そろえば結合して解析する", () => {
    const partial = parseJahis([part1]);
    expect(partial).toEqual({ status: "needsMore", splitId: "12345678901234", total: 2, received: [1] });

    // 順不同・重複ありでも成立する
    const complete = parseJahis([part2, part1, part2]);
    expect(complete.status).toBe("ok");
    if (complete.status !== "ok") return;
    const g = complete.datas[0]!.groups[0]!;
    expect(g.medications[0]!.usageText).toBe("【分３ 毎食後服用】");
    expect(g.generalNotes).toContain("正しい飲み方は薬袋等をご覧下さい。");
  });

  it("別 ID の分割データが不完全なら needsMore になる", () => {
    const other = ["JAHISTC08,1", "911,22222222222222,2,2"].join("\n");
    const result = parseJahis([part1, part2, other]);
    expect(result.status).toBe("needsMore");
    if (result.status !== "needsMore") return;
    expect(result.splitId).toBe("22222222222222");
  });
});

describe("parseJahis (移行データ: 複数データ・複数調剤)", () => {
  it("1 データ内の複数調剤 (No.5 複数) を調剤ごとのグループに分割する", () => {
    const payload = [
      "JAHISTC08,2",
      "1,鈴木 太郎,1,19580303,,,,,,",
      "5,20260601,1",
      "11,A薬局,13,4,1234567,,,03-1111-1111,1",
      "201,1,薬その一,1,錠,1,,1,,,",
      "301,1,朝食後,7,日分,1,1,,1",
      "5,20260701,1",
      "11,B薬局,13,4,7654321,,,03-2222-2222,1",
      "201,1,薬その二,2,錠,1,,1,,,",
      "301,1,毎食後,14,日分,1,1,,1",
    ].join("\n");
    const result = parseJahis([payload]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const groups = result.datas[0]!.groups;
    expect(groups).toHaveLength(2);
    expect(groups[0]!.dispensedAt).toBe("2026-06-01");
    expect(groups[0]!.pharmacyName).toBe("A薬局");
    expect(groups[0]!.medications[0]!.name).toBe("薬その一");
    expect(groups[1]!.dispensedAt).toBe("2026-07-01");
    expect(groups[1]!.pharmacyName).toBe("B薬局");
    // RP 番号はグループごとにリセットされる (前グループの用法が漏れない)
    expect(groups[1]!.medications[0]!.usageText).toBe("毎食後");
    expect(groups[0]!.medications[0]!.usageText).toBe("朝食後");
  });

  it("複数ファイル (分割なしペイロード複数) をそれぞれ独立に解析する", () => {
    const fileA = ["JAHISTC08,2", "5,20260101,1", "201,1,薬A,1,錠,1,,1,,,"].join("\n");
    const fileB = ["JAHISTC08,2", "5,20260201,1", "201,1,薬B,1,錠,1,,1,,,"].join("\n");
    const result = parseJahis([fileA, fileB]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.datas).toHaveLength(2);
    expect(result.datas[0]!.groups[0]!.medications[0]!.name).toBe("薬A");
    expect(result.datas[1]!.groups[0]!.medications[0]!.name).toBe("薬B");
  });

  it("分割 QR と単独ファイルの混在も受理する", () => {
    const part1 = ["JAHISTC08,1", "5,20260301,1", "201,1,分割薬,1,錠,1,,1,,,", "911,99999999999999,2,1"].join("\n");
    const part2 = ["JAHISTC08,1", "301,1,朝食後,7,日分,1,1,,1", "911,99999999999999,2,2"].join("\n");
    const single = ["JAHISTC08,2", "5,20260401,1", "201,1,単独薬,1,錠,1,,1,,,"].join("\n");
    const result = parseJahis([single, part1, part2]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const allMeds = result.datas.flatMap((d) => d.groups.flatMap((g) => g.medications.map((m) => m.name)));
    expect(allMeds).toContain("分割薬");
    expect(allMeds).toContain("単独薬");
  });
});
