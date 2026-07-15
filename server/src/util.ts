// D1 は 1 クエリあたり SQL 変数 100 個まで。IN (...) や複数行 INSERT で超えやすいため、
// 配列をこのサイズ以下に分割してからクエリする (g-system で実際に踏んだ制限)。
export const VAR_CHUNK = 90;

export function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
