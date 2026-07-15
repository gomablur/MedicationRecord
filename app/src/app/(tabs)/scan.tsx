import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { createRecord, parseQr } from '@/api/records';
import type { RecordInput } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { QrScanner } from '@/components/qr-scanner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { setQrDraft } from '@/store/qr-draft';
import { formatDate, formatDose } from '@/utils/format';

type ScanState =
  | { phase: 'scanning' }
  | { phase: 'parsing' }
  | { phase: 'needsMore'; total: number; received: number[] }
  | { phase: 'preview'; draft: RecordInput; patientName?: string; memos: string[] }
  | { phase: 'saving'; draft: RecordInput; patientName?: string; memos: string[] };

/**
 * QR 取り込み: JAHIS お薬手帳 QR をスキャン(Web は貼り付け)して解析し、
 * プレビュー確認のうえ保存する。分割 QR は全部そろうまで読み取りを続ける。
 */
export default function ScanScreen() {
  const router = useRouter();
  const [payloads, setPayloads] = useState<string[]>([]);
  const [state, setState] = useState<ScanState>({ phase: 'scanning' });
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPayloads([]);
    setState({ phase: 'scanning' });
    setError(null);
  }, []);

  const handlePayload = useCallback(
    async (payload: string) => {
      if (state.phase === 'parsing' || state.phase === 'saving' || state.phase === 'preview') return;
      const next = payloads.includes(payload) ? payloads : [...payloads, payload];
      setPayloads(next);
      setState({ phase: 'parsing' });
      setError(null);
      try {
        const result = await parseQr(next);
        if (result.status === 'needsMore') {
          setState({ phase: 'needsMore', total: result.total, received: result.received });
        } else {
          setState({
            phase: 'preview',
            draft: result.draft,
            patientName: result.patientName,
            memos: result.memos,
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'QRコードの解析に失敗しました');
        // 解析エラーのペイロードは蓄積から外す (別のQRを読み直せるように)
        setPayloads(payloads);
        setState(payloads.length > 0 ? { phase: 'scanning' } : { phase: 'scanning' });
      }
    },
    [payloads, state.phase],
  );

  const save = useCallback(async () => {
    if (state.phase !== 'preview') return;
    setState({ ...state, phase: 'saving' });
    try {
      const record = await createRecord(state.draft);
      reset();
      router.push({ pathname: '/record/[id]', params: { id: record.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
      setState({ ...state, phase: 'preview' });
    }
  }, [reset, router, state]);

  const editAndSave = useCallback(() => {
    if (state.phase !== 'preview') return;
    setQrDraft(state.draft);
    reset();
    router.push('/record/new');
  }, [reset, router, state]);

  const busy = state.phase === 'parsing' || state.phase === 'saving';

  return (
    <Screen>
      {state.phase === 'scanning' || state.phase === 'parsing' || state.phase === 'needsMore' ? (
        <>
          <QrScanner onPayload={(p) => void handlePayload(p)} paused={busy} />
          {state.phase === 'needsMore' ? (
            <Card>
              <ThemedText type="bold">
                分割QR: {state.total}枚中{state.received.length}枚 読み取り済み
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                続けて残りのQRコードを読み取ってください。
              </ThemedText>
              <Button title="やり直す" variant="secondary" onPress={reset} />
            </Card>
          ) : (
            <ThemedText type="small" themeColor="textMuted" style={styles.hint}>
              お薬手帳の明細などに印字された JAHIS 形式のQRコードに対応しています。
            </ThemedText>
          )}
          {state.phase === 'parsing' ? (
            <ThemedText themeColor="textSecondary" style={styles.hint}>
              解析中…
            </ThemedText>
          ) : null}
        </>
      ) : (
        <PreviewCard
          draft={state.draft}
          patientName={state.patientName}
          memos={state.memos}
          saving={state.phase === 'saving'}
          onSave={() => void save()}
          onEdit={editAndSave}
          onReset={reset}
        />
      )}
      {error ? (
        <ThemedText type="small" themeColor="danger" style={styles.hint}>
          {error}
        </ThemedText>
      ) : null}
    </Screen>
  );
}

function PreviewCard({
  draft,
  patientName,
  memos,
  saving,
  onSave,
  onEdit,
  onReset,
}: {
  draft: RecordInput;
  patientName?: string;
  memos: string[];
  saving: boolean;
  onSave: () => void;
  onEdit: () => void;
  onReset: () => void;
}) {
  return (
    <View style={styles.preview}>
      <Card>
        <ThemedText type="subtitle">読み取り結果</ThemedText>
        {patientName ? (
          <ThemedText themeColor="textSecondary">患者: {patientName}</ThemedText>
        ) : null}
        <ThemedText themeColor="textSecondary">調剤日: {formatDate(draft.dispensedAt)}</ThemedText>
        {draft.pharmacyName ? (
          <ThemedText themeColor="textSecondary">薬局: {draft.pharmacyName}</ThemedText>
        ) : null}
        {draft.hospitalName ? (
          <ThemedText themeColor="textSecondary">医療機関: {draft.hospitalName}</ThemedText>
        ) : null}
        {draft.doctorName ? (
          <ThemedText themeColor="textSecondary">処方医: {draft.doctorName}</ThemedText>
        ) : null}
      </Card>
      {draft.medications.map((med, i) => (
        <Card key={i}>
          <ThemedText type="bold">{med.name}</ThemedText>
          {formatDose(med) ? <ThemedText themeColor="textSecondary">{formatDose(med)}</ThemedText> : null}
          {med.usageText ? <ThemedText themeColor="textSecondary">{med.usageText}</ThemedText> : null}
          {med.quantity ? (
            <ThemedText themeColor="textSecondary">
              {med.quantity}
              {med.quantityUnit ?? ''}
            </ThemedText>
          ) : null}
          {med.note ? (
            <ThemedText type="small" themeColor="textMuted">
              {med.note}
            </ThemedText>
          ) : null}
        </Card>
      ))}
      {draft.notes ? (
        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            注意・備考
          </ThemedText>
          <ThemedText themeColor="textSecondary">{draft.notes}</ThemedText>
        </Card>
      ) : null}
      {memos.length > 0 ? (
        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            手帳メモ (保存対象外)
          </ThemedText>
          {memos.map((memo, i) => (
            <ThemedText key={i} type="small" themeColor="textMuted">
              {memo}
            </ThemedText>
          ))}
        </Card>
      ) : null}
      <Button title="この内容で保存" onPress={onSave} loading={saving} />
      <Button title="内容を編集して保存" variant="secondary" onPress={onEdit} disabled={saving} />
      <Button title="やり直す" variant="secondary" onPress={onReset} disabled={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { textAlign: 'center' },
  preview: { gap: Spacing.three },
});
