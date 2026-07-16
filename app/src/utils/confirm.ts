import { Alert, Platform } from 'react-native';

/**
 * OS 標準の確認ダイアログ (ネイティブ: Alert / Web: window.confirm)。
 * PWA (ホーム画面追加) は想定しないため window.confirm で問題ない。
 * 破壊的操作は destructive: true にすると iOS で赤字ボタンになる。
 */
export function confirmAsync(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    const text = opts.message ? `${opts.title}\n\n${opts.message}` : opts.title;
    return Promise.resolve(window.confirm(text));
  }
  return new Promise((resolve) => {
    Alert.alert(opts.title, opts.message, [
      { text: 'キャンセル', style: 'cancel', onPress: () => resolve(false) },
      {
        text: opts.confirmLabel ?? 'OK',
        style: opts.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
