import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type QrScannerProps = {
  /** QR を1枚読み取るたびに呼ばれる */
  onPayload: (payload: string) => void;
  /** 解析中など、読み取りを一時停止したいとき true */
  paused?: boolean;
};

/**
 * ネイティブ用 QR スキャナ(expo-camera)。Web は qr-scanner.web.tsx の
 * 貼り付けフォールバックに分岐する。
 * 同じコードを向け続けたときの連続発火はここで抑制する。
 */
export function QrScanner({ onPayload, paused }: QrScannerProps) {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const lastData = useRef<string | null>(null);
  const lastAt = useRef(0);

  if (!permission) {
    return <View style={styles.placeholder} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.placeholder, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          QRコードの読み取りにはカメラの許可が必要です
        </ThemedText>
        <Button title="カメラを許可" onPress={() => void requestPermission()} />
      </View>
    );
  }

  return (
    <View style={styles.cameraWrap}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (paused || !data) return;
          const now = Date.now();
          // 直近1.5秒は無視、同一データは3秒間無視(連続発火の抑制)
          if (now - lastAt.current < 1500) return;
          if (data === lastData.current && now - lastAt.current < 3000) return;
          lastData.current = data;
          lastAt.current = now;
          onPayload(data);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cameraWrap: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
    aspectRatio: 1,
    width: '100%',
  },
  camera: { flex: 1 },
  placeholder: {
    aspectRatio: 1.5,
    width: '100%',
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  center: { textAlign: 'center' },
});
