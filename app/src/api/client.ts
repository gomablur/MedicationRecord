import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { getToken } from '@/auth/token';

/**
 * 薄い fetch ラッパー。
 * - ベース URL: Web は同一オリジン('' 固定)。ネイティブは
 *   AsyncStorage の上書き値 → EXPO_PUBLIC_API_URL → 本番 URL の順に解決
 * - ネイティブは SecureStore のトークンを Authorization ヘッダーに付与
 * - 401 を受けたら登録済みハンドラ(セッション破棄→ログイン画面へ)を呼ぶ
 */

const API_URL_STORAGE_KEY = 'okusuri.apiUrl';
const DEFAULT_API_URL = 'https://okusuri.goma-b.com';

let apiUrlOverride: string | null = null;

/** 起動時に一度呼ぶ。AsyncStorage の上書き値をメモリへ読み込む */
export async function loadApiUrlOverride(): Promise<void> {
  if (Platform.OS === 'web') return;
  apiUrlOverride = await AsyncStorage.getItem(API_URL_STORAGE_KEY);
}

/** 設定画面からのサーバー URL 上書き(null で解除) */
export async function setApiUrlOverride(url: string | null): Promise<void> {
  apiUrlOverride = url;
  if (Platform.OS === 'web') return;
  if (url) {
    await AsyncStorage.setItem(API_URL_STORAGE_KEY, url);
  } else {
    await AsyncStorage.removeItem(API_URL_STORAGE_KEY);
  }
}

export function getApiUrlOverride(): string | null {
  return apiUrlOverride;
}

export function getBaseUrl(): string {
  if (Platform.OS === 'web') return ''; // 同一オリジン(Cookie セッション)
  return (
    apiUrlOverride?.replace(/\/+$/, '') ||
    process.env.EXPO_PUBLIC_API_URL ||
    DEFAULT_API_URL
  );
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** 401 時の共通処理(セッション破棄)。SessionProvider が登録する */
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

type ApiInit = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
};

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (Platform.OS !== 'web') {
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(getBaseUrl() + path, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 401) {
    unauthorizedHandler?.();
    throw new ApiError('ログインが必要です', 401);
  }
  if (!res.ok) {
    let message = `リクエストに失敗しました (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // JSON でないエラーレスポンスは既定メッセージのまま
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}
