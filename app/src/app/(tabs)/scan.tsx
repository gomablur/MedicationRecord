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

type Preview = { drafts: RecordInput[]; patientName?: string; memos: string[] };

type ScanState =
  | { phase: 'scanning' }
  | { phase: 'parsing' }
  | { phase: 'needsMore'; total: number; received: number[] }
  | ({ phase: 'preview' } & Preview)
  | ({ phase: 'saving'; savedCount: number } & Preview);

/**
 * QR 取り込み: JAHIS お薬手帳 QR をスキャン(Web はファイルアップロード/貼り付け)して
 * 解析し、プレビュー確認のうえ保存する。
 * - 分割 QR は全部そろうまで読み取りを続ける
 * - 移行ファイル(複数データ・複数調剤)は複数件の下書きになり、一括保存できる
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

  const handlePayloads = useCallback(
    async (incoming: string[]) => {
      if (state.phase === 'parsing' || state.phase === 'saving' || state.phase === 'preview') return;
      const next = [...new Set([...payloads, ...incoming])];
      if (next.length === payloads.length) return; // 全部読み取り済み (重複)
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
            drafts: result.drafts,
            patientName: result.patientName,
            memos: result.memos,
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'データの解析に失敗しました');
        // 解析エラーの入力は蓄積から外す (別のQR・ファイルを読み直せるように)
        setPayloads(payloads);
        setState({ phase: 'scanning' });
      }
    },
    [payloads, state.phase],
  );

  // 単発保存 (下書き 1 件のとき)
  const saveSingle = useCallback(async () => {
    if (state.phase !== 'preview' || state.drafts.length !== 1) return;
    setState({ ...state, phase: 'saving', savedCount: 0 });
    try {
      const record = await createRecord(state.drafts[0]!);
      reset();
      router.push({ pathname: '/record/[id]', params: { id: record.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
      setState({ ...state, phase: 'preview' });
    }
  }, [reset, router, state]);

  // 一括保存 (移行データ)。1 件ずつ順に保存し、進捗を表示する
  const saveAll = useCallback(async () => {
    if (state.phase !== 'preview') return;
    const { drafts } = state;
    setState({ ...state, phase: 'saving', savedCount: 0 });
    let saved = 0;
    try {
      for (const draft of drafts) {
        await createRecord(draft);
        saved++;
        setState({ ...state, phase: 'saving', savedCount: saved });
      }
      reset();
      router.push('/');
    } catch (e) {
      setError(
        `${saved}/${drafts.length} 件保存した時点で失敗しました: ${e instanceof Error ? e.message : ''}`,
      );
      // 失敗分から再開できるよう、未保存の下書きだけ残す
      setState({ ...state, phase: 'preview', drafts: drafts.slice(saved) });
    }
  }, [reset, router, state]);

  const editAndSave = useCallback(() => {
    if (state.phase !== 'preview' || state.drafts.length !== 1) return;
    setQrDraft(state.drafts[0]!);
    reset();
    router.push('/record/new');
  }, [reset, router, state]);

  const busy = state.phase === 'parsing' || state.phase === 'saving';

  return (
    <Screen>
      {state.phase === 'scanning' || state.phase === 'parsing' || state.phase === 'needsMore' ? (
        <>
          <QrScanner onPayloads={(p) => void handlePayloads(p)} paused={busy} />
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
      ) : state.drafts.length === 1 ? (
        <SinglePreview
          draft={state.drafts[0]!}
          patientName={state.patientName}
          memos={state.memos}
          saving={state.phase === 'saving'}
          onSave={() => void saveSingle()}
          onEdit={editAndSave}
          onReset={reset}
        />
      ) : (
        <BulkPreview
          drafts={state.drafts}
          patientName={state.patientName}
          saving={state.phase === 'saving'}
          savedCount={state.phase === 'saving' ? state.savedCount : 0}
          onSaveAll={() => void saveAll()}
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

/** 通常の取り込み (1 件): 全項目を見せて確認する */
function SinglePreview({
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
      {memos.length > 0 ? <MemosCard memos={memos} /> : null}
      <Button title="この内容で保存" onPress={onSave} loading={saving} />
      <Button title="内容を編集して保存" variant="secondary" onPress={onEdit} disabled={saving} />
      <Button title="やり直す" variant="secondary" onPress={onReset} disabled={saving} />
    </View>
  );
}

/** 移行データの取り込み (複数件): 要約リスト + 一括保存 */
function BulkPreview({
  drafts,
  patientName,
  saving,
  savedCount,
  onSaveAll,
  onReset,
}: {
  drafts: RecordInput[];
  patientName?: string;
  saving: boolean;
  savedCount: number;
  onSaveAll: () => void;
  onReset: () => void;
}) {
  return (
    <View style={styles.preview}>
      <Card>
        <ThemedText type="subtitle">{drafts.length}件の記録を読み取りました</ThemedText>
        {patientName ? (
          <ThemedText themeColor="textSecondary">患者: {patientName}</ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textMuted">
          内容を確認して「すべて保存」を押してください。1件ずつ編集したい場合は、保存後に一覧から開いて編集できます。
        </ThemedText>
      </Card>
      {drafts.map((draft, i) => (
        <Card key={i}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {formatDate(draft.dispensedAt)}
            {draft.pharmacyName ? ` ・ ${draft.pharmacyName}` : ''}
          </ThemedText>
          {draft.medications.slice(0, 3).map((med, j) => (
            <ThemedText key={j} type="small" themeColor="textSecondary" numberOfLines={1}>
              ・{med.name}
              {formatDose(med) ? ` ${formatDose(med)}` : ''}
            </ThemedText>
          ))}
          {draft.medications.length > 3 ? (
            <ThemedText type="small" themeColor="textMuted">
              ほか{draft.medications.length - 3}件
            </ThemedText>
          ) : null}
        </Card>
      ))}
      <Button
        title={saving ? `保存中… (${savedCount}/${drafts.length})` : `${drafts.length}件すべて保存`}
        onPress={onSaveAll}
        loading={saving}
      />
      <Button title="やり直す" variant="secondary" onPress={onReset} disabled={saving} />
    </View>
  );
}

function MemosCard({ memos }: { memos: string[] }) {
  return (
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
  );
}

const styles = StyleSheet.create({
  hint: { textAlign: 'center' },
  preview: { gap: Spacing.three },
});
