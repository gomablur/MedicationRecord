import { api } from '@/api/client';
import {
  isMockMode,
  mockCreateRecord,
  mockDeleteRecord,
  mockGetRecord,
  mockListRecords,
  mockParseQr,
  mockUpdateRecord,
} from '@/api/mock';
import type { QrParseResult, RecordInput, RecordWithMeds } from '@/api/types';

/** 記録 API の型付きラッパー。お試しモード中は端末内モックに切り替わる */

export async function listRecords(q?: string): Promise<RecordWithMeds[]> {
  if (isMockMode()) return mockListRecords(q);
  const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  const data = await api<{ records: RecordWithMeds[] }>(`/api/records${query}`);
  return data.records;
}

export async function getRecord(id: string): Promise<RecordWithMeds> {
  if (isMockMode()) return mockGetRecord(id);
  const data = await api<{ record: RecordWithMeds }>(`/api/records/${id}`);
  return data.record;
}

export async function createRecord(input: RecordInput): Promise<RecordWithMeds> {
  if (isMockMode()) return mockCreateRecord(input);
  const data = await api<{ record: RecordWithMeds }>('/api/records', {
    method: 'POST',
    body: input,
  });
  return data.record;
}

export async function updateRecord(id: string, input: RecordInput): Promise<RecordWithMeds> {
  if (isMockMode()) return mockUpdateRecord(id, input);
  const data = await api<{ record: RecordWithMeds }>(`/api/records/${id}`, {
    method: 'PUT',
    body: input,
  });
  return data.record;
}

export async function deleteRecord(id: string): Promise<void> {
  if (isMockMode()) return mockDeleteRecord(id);
  await api<{ ok: true }>(`/api/records/${id}`, { method: 'DELETE' });
}

export async function parseQr(payloads: string[]): Promise<QrParseResult> {
  if (isMockMode()) return mockParseQr(payloads);
  return api<QrParseResult>('/api/qr/parse', { method: 'POST', body: { payloads } });
}
