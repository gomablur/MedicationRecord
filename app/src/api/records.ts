import { api } from '@/api/client';
import type { QrParseResult, RecordInput, RecordWithMeds } from '@/api/types';

/** 記録 API の型付きラッパー */

export async function listRecords(q?: string): Promise<RecordWithMeds[]> {
  const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  const data = await api<{ records: RecordWithMeds[] }>(`/api/records${query}`);
  return data.records;
}

export async function getRecord(id: string): Promise<RecordWithMeds> {
  const data = await api<{ record: RecordWithMeds }>(`/api/records/${id}`);
  return data.record;
}

export async function createRecord(input: RecordInput): Promise<RecordWithMeds> {
  const data = await api<{ record: RecordWithMeds }>('/api/records', {
    method: 'POST',
    body: input,
  });
  return data.record;
}

export async function updateRecord(id: string, input: RecordInput): Promise<RecordWithMeds> {
  const data = await api<{ record: RecordWithMeds }>(`/api/records/${id}`, {
    method: 'PUT',
    body: input,
  });
  return data.record;
}

export async function deleteRecord(id: string): Promise<void> {
  await api<{ ok: true }>(`/api/records/${id}`, { method: 'DELETE' });
}

export async function parseQr(payloads: string[]): Promise<QrParseResult> {
  return api<QrParseResult>('/api/qr/parse', { method: 'POST', body: { payloads } });
}
