import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export type QrScannerProps = {
  /** QR の文字列を1件渡すたびに呼ばれる */
  onPayload: (payload: string) => void;
  paused?: boolean;
};

/**
 * Web 用フォールバック: カメラは使わず、QR の文字列を貼り付けて解析する。
 * (スマホで読み取った JAHIS ペイロードのコピー&ペーストを想定)
 */
export function QrScanner({ onPayload, paused }: QrScannerProps) {
  const [text, setText] = useState('');

  const submit = () => {
    const payload = text.trim();
    if (!payload) return;
    onPayload(payload);
    setText('');
  };

  return (
    <View style={styles.wrap}>
      <ThemedText themeColor="textSecondary">
        Web 版はカメラ読み取りに対応していません。QRコードの内容(文字列)を貼り付けて解析してください。
      </ThemedText>
      <Field
        label="QRコードの内容"
        value={text}
        onChangeText={setText}
        multiline
        placeholder="JAHIS形式のQRペイロードを貼り付け"
      />
      <Button title="解析" onPress={submit} disabled={paused || !text.trim()} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
});
