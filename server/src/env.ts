import type { drizzle } from "drizzle-orm/d1";

/** wrangler.jsonc / secrets で定義されるバインディング */
export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  /** JWT 署名鍵 (本番: wrangler secret put JWT_SECRET) */
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** "true" のとき /api/auth/dev (Google なしログイン) を有効化 */
  DEV_AUTH?: string;
  /** ネイティブアプリへのコールバックに使うカスタム URL スキーム */
  APP_SCHEME: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    user: AuthUser;
    db: ReturnType<typeof drizzle>;
  };
};
