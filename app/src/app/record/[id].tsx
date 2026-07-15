import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deleteRecord, getRecord } from '@/api/records';
import type { Medication, RecordWithMeds } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmButton } from '@/components/confirm-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { doseFormLabel, formatDate, formatDose } from '@/utils/format';

/** 記録の詳細: 調剤情報 + 薬の一覧。編集・削除の入口 */
export default function RecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<RecordWithMeds | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 編集から戻ってきたときに反映するため、フォーカスごとに再読込
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      void getRecord(id)
        .then(setRecord)
        .catch((e) => setError(e instanceof Error ? e.message : '読み込みに失敗しました'));
    }, [id]),
  );

  const remove = useCallback(async () => {
    if (!id) return;
    try {
      await deleteRecord(id);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました');
    }
  }, [id, router]);

  if (error) {
    return (
      <Screen>
        <ThemedText themeColor="danger">{error}</ThemedText>
      </Screen>
    );
  }
  if (!record) {
    return (
      <Screen>
        <ThemedText themeColor="textSecondary">読み込み中…</ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <ThemedText type="subtitle">{formatDate(record.dispensedAt)}</ThemedText>
        {record.pharmacyName ? (
          <Row label="薬局" value={record.pharmacyName} />
        ) : null}
        {record.pharmacyPhone ? <Row label="電話" value={record.pharmacyPhone} /> : null}
        {record.hospitalName ? <Row label="医療機関" value={record.hospitalName} /> : null}
        {record.doctorName ? <Row label="処方医" value={record.doctorName} /> : null}
        {record.source === 'qr' ? (
          <ThemedText type="small" themeColor="textMuted">
            QRコードから取り込んだ記録です
          </ThemedText>
        ) : null}
      </Card>

      <ThemedText type="smallBold" themeColor="textSecondary">
        お薬 ({record.medications.length}件)
      </ThemedText>
      {record.medications.map((med) => (
        <MedicationCard key={med.id} med={med} />
      ))}

      {record.notes ? (
        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            注意・備考
          </ThemedText>
          <ThemedText themeColor="textSecondary">{record.notes}</ThemedText>
        </Card>
      ) : null}

      <View style={styles.actions}>
        <Button
          title="編集"
          variant="secondary"
          onPress={() => router.push({ pathname: '/record/new', params: { id: record.id } })}
        />
        <ConfirmButton
          title="この記録を削除"
          confirmTitle="もう一度タップで削除"
          variant="danger"
          onConfirm={() => void remove()}
        />
      </View>
    </Screen>
  );
}

function MedicationCard({ med }: { med: Medication }) {
  const theme = useTheme();
  const form = doseFormLabel(med.doseFormCode);
  return (
    <Card>
      <View style={styles.medHeader}>
        <ThemedText type="bold" style={styles.medName}>
          {med.name}
        </ThemedText>
        {form ? (
          <View style={[styles.badge, { backgroundColor: theme.badge }]}>
            <ThemedText type="small" themeColor="tint">
              {form}
            </ThemedText>
          </View>
        ) : null}
      </View>
      {med.genericName ? (
        <ThemedText type="small" themeColor="textMuted">
          {med.genericName}
        </ThemedText>
      ) : null}
      {formatDose(med) ? <Row label="用量" value={formatDose(med)!} /> : null}
      {med.usageText ? <Row label="用法" value={med.usageText} /> : null}
      {med.quantity ? <Row label="数量" value={`${med.quantity}${med.quantityUnit ?? ''}`} /> : null}
      {med.note ? (
        <ThemedText type="small" themeColor="textMuted">
          {med.note}
        </ThemedText>
      ) : null}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textMuted" style={styles.rowLabel}>
        {label}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.rowValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: Spacing.two, marginTop: Spacing.two },
  medHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  medName: { flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'baseline' },
  rowLabel: { width: 64 },
  rowValue: { flex: 1 },
});
