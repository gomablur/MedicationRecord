import Constants from 'expo-constants';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { getApiUrlOverride, getBaseUrl, setApiUrlOverride } from '@/api/client';
import { isMockMode } from '@/api/mock';
import { useSession, type AuthProviders } from '@/auth/session';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { confirmAsync } from '@/utils/confirm';

/** 設定: アカウント情報・アカウント連携・ログアウト・(ネイティブのみ) サーバー URL 上書き */
export default function SettingsScreen() {
  const { user, signOut, linkProvider, refresh } = useSession();
  // Web の連携フローは /settings?linked=... で戻ってくる
  const params = useLocalSearchParams<{ linked?: string; error?: string }>();
  const [apiUrl, setApiUrl] = useState(getApiUrlOverride() ?? '');
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (isMockMode()) return;
    void fetch(`${getBaseUrl()}/api/auth/providers`)
      .then((res) => res.json() as Promise<AuthProviders>)
      .then(setProviders)
      .catch(() => setProviders(null));
    // Web: 連携から戻ってきた直後は連携状態を取り直す
    if (params.linked) void refresh();
    // 初回マウント時のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const link = async (provider: 'google' | 'apple') => {
    setLinkError(null);
    setLinking(true);
    try {
      await linkProvider(provider);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : '連携に失敗しました');
    } finally {
      setLinking(false);
    }
  };

  const saveApiUrl = async () => {
    const url = apiUrl.trim();
    await setApiUrlOverride(url || null);
    setSavedMessage(url ? `保存しました: ${url}` : `既定値に戻しました: ${getBaseUrl()}`);
  };

  return (
    <Screen>
      <Card>
        <ThemedText type="smallBold" themeColor="textSecondary">
          アカウント
        </ThemedText>
        <ThemedText type="bold">{user?.name}</ThemedText>
        <ThemedText themeColor="textSecondary">{user?.email}</ThemedText>
        {isMockMode() ? (
          <ThemedText type="small" themeColor="textMuted">
            お試しモード中です。データはこの端末にだけ保存され、終了すると削除されます。
          </ThemedText>
        ) : null}
        <Button
          title={isMockMode() ? 'お試しモードを終了' : 'ログアウト'}
          variant="secondary"
          onPress={() => {
            void (async () => {
              const ok = await confirmAsync(
                isMockMode()
                  ? {
                      title: 'お試しモードを終了しますか?',
                      message: '端末内のサンプルデータは削除されます。',
                      confirmLabel: '終了',
                      destructive: true,
                    }
                  : { title: 'ログアウトしますか?', confirmLabel: 'ログアウト' },
              );
              if (ok) await signOut();
            })();
          }}
        />
      </Card>

      {!isMockMode() && providers && (providers.google || providers.apple) ? (
        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            アカウント連携
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted">
            Google と Apple の両方を連携しておくと、どちらでログインしても同じ記録にアクセスできます
            (Apple の「メールを非公開」でも連携できます)。
          </ThemedText>
          {providers.google ? (
            <ProviderRow
              label="Google"
              linked={!!user?.linkedGoogle}
              busy={linking}
              onLink={() => void link('google')}
            />
          ) : null}
          {providers.apple ? (
            <ProviderRow
              label="Apple"
              linked={!!user?.linkedApple}
              busy={linking}
              onLink={() => void link('apple')}
            />
          ) : null}
          {params.error === 'link_conflict' || linkError ? (
            <ThemedText type="small" themeColor="danger">
              {linkError ??
                '連携できませんでした。そのアカウントで既に別のユーザーが作成されている可能性があります。'}
            </ThemedText>
          ) : null}
          {params.linked ? (
            <ThemedText type="small" themeColor="tint">
              {params.linked === 'google' ? 'Google' : 'Apple'} アカウントを連携しました。
            </ThemedText>
          ) : null}
        </Card>
      ) : null}

      {Platform.OS !== 'web' ? (
        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            サーバー URL
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted">
            開発時にローカルサーバーへ接続する場合に上書きします。空欄で既定値
            ({process.env.EXPO_PUBLIC_API_URL || 'https://okusuri.goma-b.com'}) に戻ります。
          </ThemedText>
          <Field
            value={apiUrl}
            onChangeText={(v) => {
              setApiUrl(v);
              setSavedMessage(null);
            }}
            placeholder="http://192.168.x.x:8787"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Button title="保存" variant="secondary" onPress={() => void saveApiUrl()} />
          {savedMessage ? (
            <ThemedText type="small" themeColor="tint">
              {savedMessage}
            </ThemedText>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <ThemedText type="smallBold" themeColor="textSecondary">
          このアプリについて
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          お薬手帳 v{Constants.expoConfig?.version ?? '1.0.0'}
        </ThemedText>
        <ThemedText type="small" themeColor="textMuted" style={styles.note}>
          本アプリは処方内容の記録・表示のみを行います。服用方法などの判断は医師・薬剤師の指示に従ってください。
        </ThemedText>
      </Card>
    </Screen>
  );
}

function ProviderRow({
  label,
  linked,
  busy,
  onLink,
}: {
  label: string;
  linked: boolean;
  busy: boolean;
  onLink: () => void;
}) {
  return (
    <View style={styles.providerRow}>
      <ThemedText style={styles.providerLabel}>{label}</ThemedText>
      {linked ? (
        <ThemedText type="smallBold" themeColor="tint">
          連携済み
        </ThemedText>
      ) : (
        <Button title="連携する" variant="secondary" onPress={onLink} disabled={busy} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: Spacing.one },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  providerLabel: { flex: 1 },
});
