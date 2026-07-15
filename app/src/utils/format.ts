import type { Medication, MedicationInput } from '@/api/types';

/** 表示用フォーマッタ(純粋関数) */

/** 剤形コード → 表示名(JAHIS の剤形レコード種別) */
export const DOSE_FORM_LABELS: Record<string, string> = {
  '1': '内服',
  '2': '内滴',
  '3': '屯服',
  '4': '注射',
  '5': '外用',
  '6': '浸煎薬',
  '7': '湯薬',
  '9': '材料',
  '10': 'その他',
};

export function doseFormLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return DOSE_FORM_LABELS[code] ?? null;
}

/** 'YYYY-MM-DD' → 'YYYY年M月D日(曜)' */
export function formatDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  return `${Number(y)}年${Number(mo)}月${Number(d)}日(${weekday})`;
}

/** 今日の日付を 'YYYY-MM-DD'(端末ローカル)で返す */
export function todayYmd(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** 用量の表示('1' + '錠' → '1錠')。無ければ null */
export function formatDose(med: Pick<Medication | MedicationInput, 'dose' | 'doseUnit'>): string | null {
  if (!med.dose) return null;
  return `${med.dose}${med.doseUnit ?? ''}`;
}

/** 一覧カード用の1行要約: 名称 + 用量 + 用法 */
export function medSummary(med: Medication): string {
  const parts = [med.name];
  const dose = formatDose(med);
  if (dose) parts.push(dose);
  if (med.usageText) parts.push(med.usageText);
  return parts.join(' ');
}
