import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import { api, getBaseUrl, loadApiUrlOverride, setUnauthorizedHandler } from '@/api/client';
import { isMockMode, loadMockMode, MOCK_USER, setMockMode } from '@/api/mock';
import type { User } from '@/api/types';
import { clearToken, loadToken, saveToken } from '@/auth/token';

/**
 * セッション管理の React context。
 * - Web: Cookie セッション(same-origin fetch で HttpOnly Cookie が自動送信される)
 * - ネイティブ: SecureStore の JWT を Authorization ヘッダーに付与
 * 401 を受けたらセッションを破棄し、ルートレイアウトの Protected ルートが
 * ログイン画面へ誘導する。
 */

/** サーバー側で設定済みのログイン方法 (/api/auth/providers) */
export type AuthProviders = {
  google: boolean;
  apple: boolean;
  dev: boolean;
};

type Session = {
  user: User | null;
  /** 初回のセッション復元が終わるまで true */
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  /** ログイン中のユーザーにもう一方のプロバイダを紐づける (Apple のメール非公開対策) */
  linkProvider: (provider: 'google' | 'apple') => Promise<void>;
  /** お試しモード: サーバー不要、端末内のモックデータで全機能を試せる */
  signInMock: () => Promise<void>;
  /** 開発用ログイン(__DEV__ かつローカルサーバーのみ) */
  signInDev: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (isMockMode()) {
      setUser(MOCK_USER);
      return;
    }
    try {
      const me = await api<User>('/api/me');
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // 401 の共通処理: トークン破棄 → user が null になり login へリダイレクトされる
    setUnauthorizedHandler(() => {
      void clearToken();
      setUser(null);
    });
    void (async () => {
      const [mock] = await Promise.all([loadMockMode(), loadApiUrlOverride(), loadToken()]);
      if (mock) {
        setUser(MOCK_USER);
      } else {
        await refresh();
      }
      setLoading(false);
    })();
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  // OAuth ログインの共通フロー。Web はブラウザ遷移、ネイティブは認証ブラウザを開き
  // okusuri://auth#token=<JWT> で戻ってくる
  const signInWithProvider = useCallback(
    async (provider: 'google' | 'apple') => {
      if (Platform.OS === 'web') {
        // ブラウザ遷移でログイン → Cookie セット → '/' へ戻る
        window.location.href = `${getBaseUrl()}/api/auth/${provider}`;
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(
        `${getBaseUrl()}/api/auth/${provider}/native`,
        'okusuri://auth',
      );
      if (result.type !== 'success') return;
      const match = /[#&]token=([^&]+)/.exec(result.url);
      if (!match) throw new Error('認証トークンを取得できませんでした');
      await saveToken(decodeURIComponent(match[1]));
      await refresh();
    },
    [refresh],
  );

  const signInWithGoogle = useCallback(() => signInWithProvider('google'), [signInWithProvider]);
  const signInWithApple = useCallback(() => signInWithProvider('apple'), [signInWithProvider]);

  const linkProvider = useCallback(
    async (provider: 'google' | 'apple') => {
      if (Platform.OS === 'web') {
        // Web はセッションクッキーで連携対象が分かる。完了後 /settings に戻ってくる
        window.location.href = `${getBaseUrl()}/api/auth/${provider}/link`;
        return;
      }
      // ネイティブ: ブラウザにはセッションがないため、短命の連携トークンで引き継ぐ
      const { token } = await api<{ token: string }>('/api/auth/link-token', { method: 'POST' });
      const result = await WebBrowser.openAuthSessionAsync(
        `${getBaseUrl()}/api/auth/${provider}/link?lt=${encodeURIComponent(token)}&native=1`,
        'okusuri://auth',
      );
      if (result.type !== 'success') return;
      if (/[#&]error=/.test(result.url)) {
        throw new Error('連携できませんでした。そのアカウントで既に別のユーザーが作成されている可能性があります。');
      }
      await refresh();
    },
    [refresh],
  );

  const signInMock = useCallback(async () => {
    await setMockMode(true);
    setUser(MOCK_USER);
  }, []);

  const signInDev = useCallback(async () => {
    if (Platform.OS === 'web') {
      // Web はサーバー側で Cookie をセットして '/' へリダイレクトする
      window.location.href = getBaseUrl() + '/api/auth/dev';
      return;
    }
    const res = await fetch(getBaseUrl() + '/api/auth/dev?native=1');
    if (!res.ok) throw new Error('開発用ログインに失敗しました(ローカルサーバー限定)');
    const data = (await res.json()) as { token: string };
    await saveToken(data.token);
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    if (isMockMode()) {
      // お試しモード終了: モックデータも破棄する
      await setMockMode(false);
      setUser(null);
      return;
    }
    if (Platform.OS === 'web') {
      try {
        await api<{ ok: true }>('/api/auth/logout', { method: 'POST' });
      } catch {
        // Cookie が既に無効でもログアウト扱いにする
      }
    }
    await clearToken(); // ネイティブはトークン破棄のみでよい
    setUser(null);
  }, []);

  const value = useMemo<Session>(
    () => ({ user, loading, signInWithGoogle, signInWithApple, linkProvider, signInMock, signInDev, signOut, refresh }),
    [user, loading, signInWithGoogle, signInWithApple, linkProvider, signInMock, signInDev, signOut, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession は SessionProvider の内側で使うこと');
  return session;
}
