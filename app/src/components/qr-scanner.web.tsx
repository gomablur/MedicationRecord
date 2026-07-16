import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { QrScannerProps } from '@/components/qr-scanner';

export type { QrScannerProps };

/**
 * Web 用の取り込み UI (カメラは使わない)。2 つの入口を提供する:
 *   1. ファイルアップロード (複数可) — 他のお薬手帳アプリからの移行データ
 *      (QR の中身の JAHIS 形式テキスト/CSV) を想定。Shift_JIS / UTF-8 を自動判別
 *   2. テキスト貼り付け — スマホで読み取った QR ペイロードのコピペを想定
 */
export function QrScanner({ onPayloads, paused }: QrScannerProps) {
  const [text, setText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);

  const submitText = () => {
    const payload = text.trim();
    if (!payload) return;
    onPayloads([payload]);
    setText('');
  };

  const pickFiles = () => {
    setFileError(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    // JAHIS の移行データはアプリによって拡張子がまちまち (.txt / .csv / .jahis 等)
    input.accept = '.txt,.csv,.dat,.jahis,text/*';
    input.onchange = () => {
      void (async () => {
        const files = [...(input.files ?? [])];
        if (files.length === 0) return;
        try {
          const payloads = await Promise.all(files.map(readJahisFile));
          onPayloads(payloads);
        } catch (e) {
          setFileError(e instanceof Error ? e.message : 'ファイルの読み込みに失敗しました');
        }
      })();
    };
    input.click();
  };

  return (
    <View style={styles.wrap}>
      <ThemedText themeColor="textSecondary">
        他のお薬手帳アプリから書き出した JAHIS 形式のファイル (QRコードの中身のテキスト/CSV)
        をアップロードして取り込めます。複数ファイルをまとめて選択できます。
      </ThemedText>
      <Button title="ファイルを選択 (複数可)" onPress={pickFiles} disabled={paused} />
      {fileError ? (
        <ThemedText type="small" themeColor="danger">
          {fileError}
        </ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textMuted">
        または、QRコードの内容 (文字列) を貼り付けて解析することもできます。
      </ThemedText>
      <Field
        label="QRコードの内容"
        value={text}
        onChangeText={setText}
        multiline
        placeholder="JAHIS形式のQRペイロードを貼り付け"
      />
      <Button title="解析" variant="secondary" onPress={submitText} disabled={paused || !text.trim()} />
    </View>
  );
}

/**
 * JAHIS ファイルをテキストとして読む。文字コードは UTF-8 を優先し、
 * デコードできなければ Shift_JIS (古いアプリの書き出しに多い) を試す。
 */
async function readJahisFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('shift_jis').decode(buf);
    } catch {
      throw new Error(`${file.name}: テキストファイルとして読み込めませんでした`);
    }
  }
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
});
