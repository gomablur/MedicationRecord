import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { createRecord, getRecord, updateRecord } from '@/api/records';
import type { MedicationInput, RecordInput } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { consumeQrDraft } from '@/store/qr-draft';
import { todayYmd } from '@/utils/format';

/** フォーム内部で扱う薬 1 件 (入力中は空文字を許す) */
type MedForm = {
  name: string;
  dose: string;
  doseUnit: string;
  usageText: string;
  quantity: string;
  quantityUnit: string;
  note: string;
  /** QR 由来の編集で保持するフィールド (フォームには出さない) */
  carried: Pick<MedicationInput, 'rpNumber' | 'doseFormCode' | 'genericName' | 'drugCodeType' | 'drugCode'>;
};

const emptyMed = (): MedForm => ({
  name: '',
  dose: '',
  doseUnit: '',
  usageText: '',
  quantity: '',
  quantityUnit: '',
  note: '',
  carried: {},
});

function toMedForm(m: MedicationInput): MedForm {
  return {
    name: m.name,
    dose: m.dose ?? '',
    doseUnit: m.doseUnit ?? '',
    usageText: m.usageText ?? '',
    quantity: m.quantity ?? '',
    quantityUnit: m.quantityUnit ?? '',
    note: m.note ?? '',
    carried: {
      rpNumber: m.rpNumber ?? null,
      doseFormCode: m.doseFormCode ?? null,
      genericName: m.genericName ?? null,
      drugCodeType: m.drugCodeType ?? null,
      drugCode: m.drugCode ?? null,
    },
  };
}

/**
 * 記録の入力フォーム。3 モード:
 * - 新規手動追加 (パラメータなし)
 * - 既存記録の編集 (?id=)
 * - QR 解析結果の編集 (qr-draft ストアから prefill)
 */
export default function RecordFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();

  const [dispensedAt, setDispensedAt] = useState(todayYmd());
  const [pharmacyName, setPharmacyName] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [notes, setNotes] = useState('');
  const [meds, setMeds] = useState<MedForm[]>([emptyMed()]);
  // QR 由来のとき保持するメタ情報
  const [source, setSource] = useState<'manual' | 'qr'>('manual');
  const [rawQr, setRawQr] = useState<string | null>(null);

  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // prefill: QR ドラフト → 既存記録 (id) の順で試す
  useEffect(() => {
    const draft = consumeQrDraft();
    if (draft) {
      applyInput(draft);
      setLoading(false);
      return;
    }
    if (!id) return;
    void getRecord(id)
      .then((r) => {
        applyInput({ ...r, medications: r.medications });
        setSource(r.source);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '読み込みに失敗しました'))
      .finally(() => setLoading(false));
    // 初回マウント時のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyInput(input: RecordInput) {
    setDispensedAt(input.dispensedAt);
    setPharmacyName(input.pharmacyName ?? '');
    setHospitalName(input.hospitalName ?? '');
    setDoctorName(input.doctorName ?? '');
    setNotes(input.notes ?? '');
    setMeds(input.medications.length > 0 ? input.medications.map(toMedForm) : [emptyMed()]);
    if (input.source) setSource(input.source);
    if (input.rawQr) setRawQr(input.rawQr);
  }

  const setMed = (i: number, patch: Partial<MedForm>) => {
    setMeds((prev) => prev.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  };

  const save = async () => {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dispensedAt)) {
      setError('調剤日は YYYY-MM-DD 形式で入力してください');
      return;
    }
    const validMeds = meds.filter((m) => m.name.trim());
    if (validMeds.length === 0) {
      setError('お薬を1件以上入力してください');
      return;
    }
    const input: RecordInput = {
      dispensedAt,
      pharmacyName: pharmacyName.trim() || null,
      hospitalName: hospitalName.trim() || null,
      doctorName: doctorName.trim() || null,
      notes: notes.trim() || null,
      source,
      rawQr,
      medications: validMeds.map((m) => ({
        ...m.carried,
        name: m.name.trim(),
        dose: m.dose.trim() || null,
        doseUnit: m.doseUnit.trim() || null,
        usageText: m.usageText.trim() || null,
        quantity: m.quantity.trim() || null,
        quantityUnit: m.quantityUnit.trim() || null,
        note: m.note.trim() || null,
      })),
    };
    setSaving(true);
    try {
      if (id) {
        await updateRecord(id, input);
        router.back();
      } else {
        const record = await createRecord(input);
        router.replace({ pathname: '/record/[id]', params: { id: record.id } });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <ThemedText themeColor="textSecondary">読み込み中…</ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Field
          label="調剤日 (YYYY-MM-DD)"
          value={dispensedAt}
          onChangeText={setDispensedAt}
          placeholder={todayYmd()}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field label="薬局名" value={pharmacyName} onChangeText={setPharmacyName} placeholder="○○薬局" />
        <Field
          label="医療機関名"
          value={hospitalName}
          onChangeText={setHospitalName}
          placeholder="○○クリニック"
        />
        <Field label="処方医" value={doctorName} onChangeText={setDoctorName} placeholder="○○先生" />
        <Field label="メモ・注意事項" value={notes} onChangeText={setNotes} multiline />
      </Card>

      <ThemedText type="smallBold" themeColor="textSecondary">
        お薬
      </ThemedText>
      {meds.map((med, i) => (
        <Card key={i}>
          <Field
            label={`薬品名 ${i + 1}`}
            value={med.name}
            onChangeText={(v) => setMed(i, { name: v })}
            placeholder="○○錠 5mg"
          />
          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <Field
                label="用量"
                value={med.dose}
                onChangeText={(v) => setMed(i, { dose: v })}
                placeholder="1"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.pairItem}>
              <Field
                label="単位"
                value={med.doseUnit}
                onChangeText={(v) => setMed(i, { doseUnit: v })}
                placeholder="錠"
              />
            </View>
          </View>
          <Field
            label="用法"
            value={med.usageText}
            onChangeText={(v) => setMed(i, { usageText: v })}
            placeholder="1日3回 毎食後"
          />
          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <Field
                label="数量"
                value={med.quantity}
                onChangeText={(v) => setMed(i, { quantity: v })}
                placeholder="14"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.pairItem}>
              <Field
                label="数量の単位"
                value={med.quantityUnit}
                onChangeText={(v) => setMed(i, { quantityUnit: v })}
                placeholder="日分"
              />
            </View>
          </View>
          <Field label="メモ" value={med.note} onChangeText={(v) => setMed(i, { note: v })} />
          {meds.length > 1 ? (
            <Button
              title="このお薬を削除"
              variant="secondary"
              onPress={() => setMeds((prev) => prev.filter((_, j) => j !== i))}
            />
          ) : null}
        </Card>
      ))}
      <Button
        title="お薬を追加"
        variant="secondary"
        onPress={() => setMeds((prev) => [...prev, emptyMed()])}
      />

      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
      <Button title={id ? '更新する' : '保存する'} onPress={() => void save()} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: Spacing.two },
  pairItem: { flex: 1 },
});
