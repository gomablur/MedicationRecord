// 認証まわり一式: Google OAuth・開発用ログイン・セッション・認可ミドルウェア。
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
import type { AppEnv, AuthUser } from "./env";

const COOKIE_NAME = "session";
// ネイティブフロー識別用の短命クッキー (Google 往復の間だけ保持)
const NATIVE_FLOW_COOKIE = "auth_native";
const SESSION_DAYS = 30;

/** ログイン成功時の共通処理: users を upsert して JWT を発行する */
async function loginWithProfile(
  db: ReturnType<typeof drizzle>,
  env: { JWT_SECRET: string },
  profile: { sub?: string; email: string; name: string; avatarUrl?: string | null },
): Promise<string> {
  const email = profile.email.toLowerCase();

  let user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    const id = uuidv7();
    await db.insert(users).values({
      id,
      googleSub: profile.sub ?? null,
      email,
      name: profile.name,
      avatarUrl: profile.avatarUrl ?? null,
    });
    user = await db.select().from(users).where(eq(users.id, id)).get();
  } else if (profile.sub && !user.googleSub) {
    await db
      .update(users)
      .set({ googleSub: profile.sub, avatarUrl: profile.avatarUrl ?? user.avatarUrl })
      .where(eq(users.id, user.id));
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

/** リクエストから JWT を取り出して検証し、ユーザー ID を返す (DB は見ない)。アセット配信のガードにも使う */
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

export const authApp = new Hono<AppEnv>();

// ネイティブアプリからの入口。フラグを立ててから通常の Google フローへ流す
// (Google 側に登録するリダイレクト URI を /api/auth/google の 1 つに保つため)
authApp.get("/google/native", (c) => {
  setCookie(c, NATIVE_FLOW_COOKIE, "1", { path: "/api/auth", httpOnly: true, maxAge: 600 });
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
  if (!profile?.email) return c.redirect("/?error=google");

  const db = drizzle(c.env.DB);
  const token = await loginWithProfile(db, c.env, {
    sub: profile.id,
    email: profile.email,
    name: profile.name ?? profile.email,
    avatarUrl: profile.picture,
  });

  if (getCookie(c, NATIVE_FLOW_COOKIE)) {
    deleteCookie(c, NATIVE_FLOW_COOKIE, { path: "/api/auth" });
    // トークンはフラグメント (#) で渡す: サーバーログや Referer に残さないため
    return c.redirect(`${c.env.APP_SCHEME}://auth#token=${token}`);
  }
  setSessionCookie(c, token);
  return c.redirect("/");
});

// ローカル開発用: Google なしでログイン (DEV_AUTH="true" のときのみ)
authApp.get("/dev", async (c) => {
  if (c.env.DEV_AUTH !== "true") return c.notFound();
  const db = drizzle(c.env.DB);
  const token = await loginWithProfile(db, c.env, {
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

  const user: AuthUser = { id: row.id, email: row.email, name: row.name };
  c.set("user", user);
  c.set("db", db);
  await next();
});
