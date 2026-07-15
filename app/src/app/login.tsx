import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getBaseUrl } from '@/api/client';
import { useSession, type AuthProviders } from '@/auth/session';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * ログイン画面 (3 プラットフォーム共通)。表示するボタンはサーバーの
 * /api/auth/providers (設定済みのログイン方法) に従う。
 */
export default function LoginScreen() {
  const theme = useTheme();
  const { signInWithGoogle, signInWithApple, signInDev } = useSession();
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${getBaseUrl()}/api/auth/providers`)
      .then((res) => res.json() as Promise<AuthProviders>)
      .then(setProviders)
      .catch(() => {
        // サーバーに届かない場合も Google ボタンだけは出す (本番の既定構成)
        setProviders({ google: true, apple: false, dev: false });
      });
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ログインに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.column}>
        <View style={styles.hero}>
          <ThemedText type="title">お薬手帳</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            処方されたお薬の記録を、QRコードでかんたんに。
          </ThemedText>
        </View>
        <View style={styles.buttons}>
          {providers?.google ? (
            <Button
              title="Googleでログイン"
              onPress={() => void run(signInWithGoogle)}
              loading={busy}
            />
          ) : null}
          {providers?.apple ? (
            <Button
              title="Appleでログイン"
              onPress={() => void run(signInWithApple)}
              disabled={busy}
            />
          ) : null}
          {providers?.dev && __DEV__ ? (
            <Button
              title="開発用ログイン"
              variant="secondary"
              onPress={() => void run(signInDev)}
              disabled={busy}
            />
          ) : null}
          {error ? (
            <ThemedText type="small" themeColor="danger" style={styles.center}>
              {error}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.five,
  },
  hero: { alignItems: 'center', gap: Spacing.two },
  buttons: { gap: Spacing.three },
  center: { textAlign: 'center' },
});
