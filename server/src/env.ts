import type { drizzle } from "drizzle-orm/d1";

/** wrangler.jsonc / secrets で定義されるバインディング */
export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  /** JWT 署名鍵 (本番: wrangler secret put JWT_SECRET) */
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  // Sign in with Apple (未設定なら Apple ログインは無効のまま動く)
  APPLE_TEAM_ID?: string;
  /** Services ID (Web 用クライアント ID) */
  APPLE_CLIENT_ID?: string;
  APPLE_KEY_ID?: string;
  /** .p8 秘密鍵の中身 (PKCS#8 PEM) */
  APPLE_PRIVATE_KEY?: string;
  /** "true" のとき /api/auth/dev (Google なしログイン) を有効化 */
  DEV_AUTH?: string;
  /** ネイティブアプリへのコールバックに使うカスタム URL スキーム */
  APP_SCHEME: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  /** アカウント連携の状態 (設定画面の表示用) */
  linkedGoogle: boolean;
  linkedApple: boolean;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    user: AuthUser;
    db: ReturnType<typeof drizzle>;
  };
};
