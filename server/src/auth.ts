// 認証まわり一式: Google / Apple OAuth・開発用ログイン・セッション・認可ミドルウェア。
//
// 登録は誰でも可能 (許可リストなし)。データは各 API が userId でスコープするため
// 他人の記録は見えない。
//
// セッションは 2 形態をサポートする:
//   - Web:       JWT を HttpOnly クッキーに保存 (SPA は同一オリジンなので自動送信)
//   - ネイティブ: JWT を Bearer トークンとして Authorization ヘッダーで送る
//     (ログイン完了時に `${APP_SCHEME}://auth#token=...` へリダイレクトしてアプリへ渡す)
import { Hono } from "hono";
import type { Context } from "hono";
import { googleAuth } from "@hono/oauth-providers/google";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { createMiddleware } from "hono/factory";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { users } from "./db/schema";
import {
  buildAppleAuthUrl,
  exchangeAppleCode,
  parseAppleUserField,
  type AppleConfig,
} from "./apple";
import type { AppEnv, Bindings, AuthUser } from "./env";

const COOKIE_NAME = "session";
// ネイティブフロー識別用の短命クッキー (Google 往復の間だけ保持)
const NATIVE_FLOW_COOKIE = "auth_native";
const SESSION_DAYS = 30;

type LoginProfile = {
  provider: "google" | "apple";
  sub: string;
  /** Apple は 2 回目以降 email が取れないことがあるため省略可 */
  email?: string;
  name?: string;
  avatarUrl?: string | null;
};

/**
 * ログイン成功時の共通処理: users を upsert して JWT を発行する。
 * 照合はプロバイダの sub を優先し、なければメールで既存アカウントに紐づける
 * (同じメールなら Google / Apple どちらでログインしても同一ユーザー)。
 */
async function loginWithProfile(
  db: ReturnType<typeof drizzle>,
  env: { JWT_SECRET: string },
  profile: LoginProfile,
): Promise<string> {
  const email = profile.email?.toLowerCase();
  const subColumn = profile.provider === "google" ? users.googleSub : users.appleSub;

  let user = await db.select().from(users).where(eq(subColumn, profile.sub)).get();
  if (!user && email) {
    user = await db.select().from(users).where(eq(users.email, email)).get();
  }

  if (!user) {
    if (!email) throw new Error("初回ログインにはメールアドレスの提供が必要です");
    const id = uuidv7();
    await db.insert(users).values({
      id,
      googleSub: profile.provider === "google" ? profile.sub : null,
      appleSub: profile.provider === "apple" ? profile.sub : null,
      email,
      name: profile.name || email,
      avatarUrl: profile.avatarUrl ?? null,
    });
    user = await db.select().from(users).where(eq(users.id, id)).get();
  } else {
    // 未紐づけのプロバイダ sub やアイコンを補完する
    const patch: Partial<typeof users.$inferInsert> = {};
    if (profile.provider === "google" && !user.googleSub) patch.googleSub = profile.sub;
    if (profile.provider === "apple" && !user.appleSub) patch.appleSub = profile.sub;
    if (profile.avatarUrl && !user.avatarUrl) patch.avatarUrl = profile.avatarUrl;
    if (Object.keys(patch).length > 0) {
      await db.update(users).set(patch).where(eq(users.id, user.id));
    }
  }
  if (!user) throw new Error("ユーザーの作成に失敗しました");

  return sign(
    { sub: user.id, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60 },
    env.JWT_SECRET,
  );
}

function setSessionCookie(c: Context, token: string) {
  // http(ローカル開発等)では Secure クッキーが保存されないため、https のときのみ付与
  const isHttps = new URL(c.req.url).protocol === "https:";
  setCookie(c, COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    secure: isHttps,
    sameSite: "Lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** ログイン完了の共通処理: ネイティブはトークンをスキームで返し、Web はクッキー */
function finishLogin(c: Context<AppEnv>, token: string, native: boolean) {
  if (native) {
    // トークンはフラグメント (#) で渡す: サーバーログや Referer に残さないため
    return c.redirect(`${c.env.APP_SCHEME}://auth#token=${token}`);
  }
  setSessionCookie(c, token);
  return c.redirect("/");
}

// ─────────────── アカウント連携 (Apple のメール非公開対策) ───────────────
// Apple はプライベートリレーのメールを返すことがあり、メール一致による自動紐づけが
// 効かない。ログイン中のユーザーがもう一方のプロバイダを明示的に連携できるようにする。
// フロー: 設定画面 → /api/auth/<provider>/link → OAuth → コールバックで sub を現ユーザーに紐づけ

const LINK_COOKIE = "auth_link";
const LINK_TOKEN_MINUTES = 10;

/** ネイティブアプリがブラウザへ連携フローを引き継ぐための短命トークンを発行する */
export async function issueLinkToken(env: { JWT_SECRET: string }, userId: string): Promise<string> {
  return sign(
    { purpose: "link", sub: userId, exp: Math.floor(Date.now() / 1000) + LINK_TOKEN_MINUTES * 60 },
    env.JWT_SECRET,
  );
}

async function verifyLinkToken(env: { JWT_SECRET: string }, token: string): Promise<string | null> {
  try {
    const payload = await verify(token, env.JWT_SECRET, "HS256");
    if (payload.purpose !== "link" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/** 連携対象ユーザーの解決: Web はセッションクッキー、ネイティブは ?lt= (連携トークン) */
async function resolveLinkUser(c: Context<AppEnv>): Promise<string | null> {
  const lt = c.req.query("lt");
  if (lt) return verifyLinkToken(c.env, lt);
  return getSessionUserId(c);
}

/**
 * プロバイダの sub を既存ユーザーに紐づける。
 * その sub で既に**別の**ユーザーが存在する場合は失敗 (アカウント統合はしない)。
 */
async function linkProvider(
  db: ReturnType<typeof drizzle>,
  userId: string,
  provider: "google" | "apple",
  sub: string,
): Promise<boolean> {
  const subColumn = provider === "google" ? users.googleSub : users.appleSub;
  const owner = await db.select().from(users).where(eq(subColumn, sub)).get();
  if (owner) return owner.id === userId;
  await db
    .update(users)
    .set(provider === "google" ? { googleSub: sub } : { appleSub: sub })
    .where(eq(users.id, userId));
  return true;
}

/** 連携完了の共通処理。設定画面 (Web) またはアプリ (ネイティブ) へ結果を返す */
function finishLink(c: Context<AppEnv>, provider: "google" | "apple", ok: boolean, native: boolean) {
  if (native) {
    return c.redirect(`${c.env.APP_SCHEME}://auth#${ok ? `linked=${provider}` : "error=link_conflict"}`);
  }
  return c.redirect(ok ? `/settings?linked=${provider}` : "/settings?error=link_conflict");
}

/** リクエストから JWT を取り出して検証し、ユーザー ID を返す (DB は見ない) */
export async function getSessionUserId(c: Context<AppEnv>): Promise<string | null> {
  const authHeader = c.req.header("Authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const token = bearer ?? getCookie(c, COOKIE_NAME);
  if (!token) return null;
  try {
    const payload = await verify(token, c.env.JWT_SECRET, "HS256");
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function appleConfig(env: Bindings): AppleConfig | null {
  if (!env.APPLE_TEAM_ID || !env.APPLE_CLIENT_ID || !env.APPLE_KEY_ID || !env.APPLE_PRIVATE_KEY) {
    return null;
  }
  return {
    teamId: env.APPLE_TEAM_ID,
    clientId: env.APPLE_CLIENT_ID,
    keyId: env.APPLE_KEY_ID,
    privateKey: env.APPLE_PRIVATE_KEY,
  };
}

export const authApp = new Hono<AppEnv>();

// クライアントがログインボタンの表示を決めるための情報 (認証不要)
authApp.get("/providers", (c) => {
  return c.json({
    google: !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
    apple: !!appleConfig(c.env),
    dev: c.env.DEV_AUTH === "true",
  });
});

// ───────────────────────── Google ─────────────────────────
// ネイティブアプリからの入口。フラグを立ててから通常の Google フローへ流す
// (Google 側に登録するリダイレクト URI を /api/auth/google の 1 つに保つため)
authApp.get("/google/native", (c) => {
  setCookie(c, NATIVE_FLOW_COOKIE, "1", { path: "/api/auth", httpOnly: true, maxAge: 600 });
  return c.redirect("/api/auth/google");
});

// アカウント連携の入口。連携対象ユーザーをクッキーに載せて通常フローへ流す
// (Google のコールバックはトップレベル GET なので SameSite=Lax クッキーが届く)
authApp.get("/google/link", async (c) => {
  const userId = await resolveLinkUser(c);
  if (!userId) return c.redirect("/settings?error=link");
  setCookie(c, LINK_COOKIE, await issueLinkToken(c.env, userId), {
    path: "/api/auth",
    httpOnly: true,
    maxAge: LINK_TOKEN_MINUTES * 60,
  });
  if (c.req.query("native") === "1") {
    setCookie(c, NATIVE_FLOW_COOKIE, "1", { path: "/api/auth", httpOnly: true, maxAge: 600 });
  }
  return c.redirect("/api/auth/google");
});

authApp.use("/google", async (c, next) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    return c.text("Google OAuth が未設定です (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)", 500);
  }
  return googleAuth({
    client_id: c.env.GOOGLE_CLIENT_ID,
    client_secret: c.env.GOOGLE_CLIENT_SECRET,
    scope: ["openid", "email", "profile"],
  })(c, next);
});

authApp.get("/google", async (c) => {
  const profile = c.get("user-google");
  if (!profile?.email || !profile.id) return c.redirect("/?error=google");

  const db = drizzle(c.env.DB);
  const native = !!getCookie(c, NATIVE_FLOW_COOKIE);
  if (native) deleteCookie(c, NATIVE_FLOW_COOKIE, { path: "/api/auth" });

  // 連携モード: ログインではなく、現在のユーザーに googleSub を紐づける
  const linkCookie = getCookie(c, LINK_COOKIE);
  if (linkCookie) {
    deleteCookie(c, LINK_COOKIE, { path: "/api/auth" });
    const linkUserId = await verifyLinkToken(c.env, linkCookie);
    if (!linkUserId) return finishLink(c, "google", false, native);
    const ok = await linkProvider(db, linkUserId, "google", profile.id);
    return finishLink(c, "google", ok, native);
  }

  const token = await loginWithProfile(db, c.env, {
    provider: "google",
    sub: profile.id,
    email: profile.email,
    name: profile.name ?? profile.email,
    avatarUrl: profile.picture,
  });
  return finishLogin(c, token, native);
});

// ───────────────────────── Apple ─────────────────────────
// Apple は scope 要求時のコールバックがクロスサイトの form POST になるため、
// SameSite=Lax のクッキーが届かない。ネイティブフラグ・連携対象ユーザー・CSRF 対策は
// state (短命 JWT) に載せて往復させる。
async function startApple(c: Context<AppEnv>, opts: { native: boolean; linkUserId?: string }) {
  const config = appleConfig(c.env);
  if (!config) return c.text("Apple ログインが未設定です (APPLE_* シークレット)", 500);
  const state = await sign(
    {
      purpose: "apple_state",
      native: opts.native,
      linkUserId: opts.linkUserId,
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    c.env.JWT_SECRET,
  );
  const redirectUri = new URL("/api/auth/apple/callback", c.req.url).toString();
  return c.redirect(buildAppleAuthUrl(config, redirectUri, state));
}

authApp.get("/apple", (c) => startApple(c, { native: false }));
authApp.get("/apple/native", (c) => startApple(c, { native: true }));

// アカウント連携の入口 (Apple)
authApp.get("/apple/link", async (c) => {
  const userId = await resolveLinkUser(c);
  if (!userId) return c.redirect("/settings?error=link");
  return startApple(c, { native: c.req.query("native") === "1", linkUserId: userId });
});

authApp.post("/apple/callback", async (c) => {
  const config = appleConfig(c.env);
  if (!config) return c.text("Apple ログインが未設定です", 500);

  const form = await c.req.parseBody();
  const code = typeof form.code === "string" ? form.code : null;
  const state = typeof form.state === "string" ? form.state : null;
  if (typeof form.error === "string" || !code || !state) return c.redirect("/?error=apple");

  let native = false;
  let linkUserId: string | undefined;
  try {
    const payload = await verify(state, c.env.JWT_SECRET, "HS256");
    if (payload.purpose !== "apple_state") throw new Error("state 不一致");
    native = payload.native === true;
    linkUserId = typeof payload.linkUserId === "string" ? payload.linkUserId : undefined;
  } catch {
    return c.redirect("/?error=apple");
  }

  try {
    const redirectUri = new URL("/api/auth/apple/callback", c.req.url).toString();
    const profile = await exchangeAppleCode(config, code, redirectUri);
    const db = drizzle(c.env.DB);

    // 連携モード: ログインではなく、現在のユーザーに appleSub を紐づける
    if (linkUserId) {
      const ok = await linkProvider(db, linkUserId, "apple", profile.sub);
      return finishLink(c, "apple", ok, native);
    }

    const name = parseAppleUserField(typeof form.user === "string" ? form.user : undefined);
    const token = await loginWithProfile(db, c.env, {
      provider: "apple",
      sub: profile.sub,
      email: profile.email,
      name,
    });
    return finishLogin(c, token, native);
  } catch (err) {
    console.error("Apple ログイン失敗:", err);
    return c.redirect("/?error=apple");
  }
});

// ───────────────────────── 開発用・共通 ─────────────────────────
// ローカル開発用: OAuth なしでログイン (DEV_AUTH="true" のときのみ)
authApp.get("/dev", async (c) => {
  if (c.env.DEV_AUTH !== "true") return c.notFound();
  const db = drizzle(c.env.DB);
  const token = await loginWithProfile(db, c.env, {
    provider: "google",
    sub: "dev-user",
    email: "dev@example.com",
    name: "開発ユーザー",
  });
  // ネイティブアプリの開発時は JSON でトークンを受け取る
  if (c.req.query("native") === "1") return c.json({ token });
  setSessionCookie(c, token);
  return c.redirect("/");
});

authApp.post("/logout", (c) => {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
  return c.json({ ok: true });
});

// 最終アクセスの更新間隔。毎リクエスト書くと D1 書き込みを浪費するため 1 時間に 1 回だけ
const LAST_SEEN_INTERVAL_MS = 60 * 60 * 1000;

// API ガード: JWT 検証 + DB 照合 (退会済みユーザーの即時無効化のため毎回 DB を見る)
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  const db = drizzle(c.env.DB);
  const row = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) return c.json({ error: "unauthorized" }, 401);

  const seen = row.lastSeenAt ? Date.parse(row.lastSeenAt) : 0;
  if (Date.now() - seen > LAST_SEEN_INTERVAL_MS) {
    await db.update(users).set({ lastSeenAt: new Date().toISOString() }).where(eq(users.id, userId));
  }

  const user: AuthUser = {
    id: row.id,
    email: row.email,
    name: row.name,
    linkedGoogle: !!row.googleSub,
    linkedApple: !!row.appleSub,
  };
  c.set("user", user);
  c.set("db", db);
  await next();
});
