import Constants from 'expo-constants';
import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { getApiUrlOverride, getBaseUrl, setApiUrlOverride } from '@/api/client';
import { isMockMode } from '@/api/mock';
import { useSession } from '@/auth/session';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { confirmAsync } from '@/utils/confirm';

/** 設定: アカウント情報・ログアウト・(ネイティブのみ) サーバー URL 上書き */
export default function SettingsScreen() {
  const { user, signOut } = useSession();
  const [apiUrl, setApiUrl] = useState(getApiUrlOverride() ?? '');
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

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

const styles = StyleSheet.create({
  note: { marginTop: Spacing.one },
});
