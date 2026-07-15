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

describe("parseJahis", () => {
  it("仕様書サンプル相当のデータを解析できる", () => {
    const result = parseJahis([FULL]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const d = result.data;
    expect(d.version).toBe(8);
    expect(d.outputType).toBe(1);
    expect(d.patientName).toBe("鈴木 太郎");
    expect(d.dispensedAt).toBe("2020-04-10");
    expect(d.pharmacyName).toBe("株式会社 工業会薬局 駅前店");
    expect(d.pharmacyPhone).toBe("03-3456-3456");
    expect(d.dispenserName).toBe("薬剤師 太郎");
    expect(d.hospitalName).toBe("医療法人 工業会病院");
    expect(d.doctorName).toBe("工業会 次郎 (内科)");

    expect(d.medications).toHaveLength(3);
    const [m1, m2, m3] = d.medications;
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

    expect(d.generalNotes).toEqual([
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
    const m = result.data.medications[0]!;
    expect(m.drugCodeType).toBe("2");
    expect(m.drugCode).toBe("612170709");
    expect(m.genericName).toBe("【般】アムロジピン錠２．５ｍｇ");
  });

  it("分割データ: 1 枚目だけなら needsMore、2 枚そろえば結合して解析する", () => {
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

    const partial = parseJahis([part1]);
    expect(partial).toEqual({ status: "needsMore", splitId: "12345678901234", total: 2, received: [1] });

    // 順不同・重複ありでも成立する
    const complete = parseJahis([part2, part1, part2]);
    expect(complete.status).toBe("ok");
    if (complete.status !== "ok") return;
    expect(complete.data.medications[0]!.usageText).toBe("【分３ 毎食後服用】");
    expect(complete.data.generalNotes).toContain("正しい飲み方は薬袋等をご覧下さい。");
  });

  it("異なる分割 ID が混ざったらエラー", () => {
    const a = ["JAHISTC08,1", "911,11111111111111,2,1"].join("\n");
    const b = ["JAHISTC08,1", "911,22222222222222,2,2"].join("\n");
    const result = parseJahis([a, b]);
    expect(result.status).toBe("error");
  });

  it("JAHIS ヘッダーがないデータはエラー", () => {
    const result = parseJahis(["https://example.com/totally-different-qr"]);
    expect(result.status).toBe("error");
  });

  it("空入力はエラー", () => {
    expect(parseJahis([]).status).toBe("error");
    expect(parseJahis(["", "  "]).status).toBe("error");
  });
});
