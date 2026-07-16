import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { listRecords } from '@/api/records';
import type { RecordWithMeds } from '@/api/types';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, medSummary } from '@/utils/format';

/** 記録一覧: 調剤日降順のカードリスト + 検索(薬名・薬局名・医療機関名) */
export default function RecordListScreen() {
  const theme = useTheme();
  const [records, setRecords] = useState<RecordWithMeds[] | null>(null);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    try {
      setError(null);
      setRecords(await listRecords(q));
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました');
    }
  }, []);

  // タブ表示のたびに再読込 (追加・編集・削除後の反映)
  useFocusEffect(
    useCallback(() => {
      void load(query);
      // query は入力の useEffect 側で反映するため、フォーカス時は現値で1回だけ
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  // 検索語の変更はデバウンスして反映
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void load(query), 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(query);
    setRefreshing(false);
  }, [load, query]);

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={records ?? []}
      keyExtractor={(r) => r.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.tint} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Field
            placeholder="薬名・薬局名で検索"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        records === null ? null : (
          <View style={styles.empty}>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              {query
                ? '該当する記録がありません'
                : 'まだ記録がありません。\n右上の + から手動で追加するか、「QR取り込み」タブから薬局のQRコードを読み取ってください。'}
            </ThemedText>
          </View>
        )
      }
      renderItem={({ item }) => <RecordCard record={item} />}
    />
  );
}

function RecordCard({ record }: { record: RecordWithMeds }) {
  const theme = useTheme();
  const shown = record.medications.slice(0, 4);
  const rest = record.medications.length - shown.length;
  // 主役は処方元の病院名 (どこの診察の薬かが一番知りたい情報)。
  // 病院名がない記録は薬局名で代替し、両方あるときだけ薬局名を小さく添える
  const title = record.hospitalName ?? record.pharmacyName;
  const sub = record.hospitalName ? record.pharmacyName : null;
  return (
    <Link href={{ pathname: '/record/[id]', params: { id: record.id } }} asChild>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {formatDate(record.dispensedAt)}
          </ThemedText>
          {record.source === 'qr' ? (
            <View style={[styles.badge, { backgroundColor: theme.badge }]}>
              <ThemedText type="small" themeColor="tint">
                QR
              </ThemedText>
            </View>
          ) : null}
        </View>
        {title ? <ThemedText type="bold">{title}</ThemedText> : null}
        {sub ? (
          <ThemedText type="small" themeColor="textMuted">
            {sub}
          </ThemedText>
        ) : null}
        <View style={styles.meds}>
          {shown.map((med) => (
            <ThemedText key={med.id} type="small" themeColor="textSecondary" numberOfLines={1}>
              ・{medSummary(med)}
            </ThemedText>
          ))}
          {rest > 0 ? (
            <ThemedText type="small" themeColor="textMuted">
              ほか{rest}件
            </ThemedText>
          ) : null}
        </View>
      </Card>
    </Link>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: { gap: Spacing.two },
  card: { gap: Spacing.one },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  meds: { gap: Spacing.half },
  empty: { paddingVertical: Spacing.five },
  center: { textAlign: 'center' },
});
