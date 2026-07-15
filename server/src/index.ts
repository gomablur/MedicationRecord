// Worker のエントリポイント。役割は 2 つ:
//   1. /api/* のルーティング (認証は authMiddleware)
//   2. SPA (Expo web export) アセットの配信ガード
//      — 未ログインには自己完結ログインページのみ返し、アプリ本体を配信しない
import { Hono } from "hono";
import { authApp, authMiddleware, getSessionUserId } from "./auth";
import { loginPageHtml } from "./login-page";
import { recordsApp } from "./routes/records";
import { qrApp } from "./routes/qr";
import type { AppEnv } from "./env";

const app = new Hono<AppEnv>();

app.route("/api/auth", authApp);

app.use("/api/*", authMiddleware);

app.get("/api/me", (c) => c.json(c.var.user));
app.route("/api/records", recordsApp);
app.route("/api/qr", qrApp);

// 認証なしで配信するファイル (アプリの中身を含まないもののみ)
const PUBLIC_PATHS = /^\/(favicon\.ico|robots\.txt|manifest\.json)$/;

app.get("*", async (c) => {
  const path = new URL(c.req.url).pathname;
  if (PUBLIC_PATHS.test(path)) return c.env.ASSETS.fetch(c.req.raw);

  const userId = await getSessionUserId(c);
  if (!userId) {
    const error = c.req.query("error") ?? undefined;
    return c.html(loginPageHtml({ error, devAuth: c.env.DEV_AUTH === "true" }), 200, {
      "Cache-Control": "no-store",
    });
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

export default app;
