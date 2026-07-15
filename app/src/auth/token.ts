import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * ネイティブ用の認証トークン(JWT)保存。SecureStore に永続化し、
 * リクエストごとの読み出しを避けるためメモリにもキャッシュする。
 * Web は Cookie セッションなのでトークンを扱わない(すべて no-op)。
 */

const TOKEN_KEY = 'okusuri.authToken';

let cached: string | null = null;
let loaded = false;

/** 起動時に一度呼ぶ。SecureStore からメモリへ読み込む */
export async function loadToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!loaded) {
    cached = await SecureStore.getItemAsync(TOKEN_KEY);
    loaded = true;
  }
  return cached;
}

/** メモリキャッシュから同期的に取得(loadToken 後に有効) */
export function getToken(): string | null {
  return cached;
}

export async function saveToken(token: string): Promise<void> {
  cached = token;
  loaded = true;
  if (Platform.OS !== 'web') {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

export async function clearToken(): Promise<void> {
  cached = null;
  loaded = true;
  if (Platform.OS !== 'web') {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}
