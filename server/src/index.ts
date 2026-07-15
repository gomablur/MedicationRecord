// Worker のエントリポイント。役割は 2 つ:
//   1. /api/* のルーティング (認証は authMiddleware)
//   2. SPA (Expo web export) アセットの配信
// SPA は誰にでも配信し、ログイン画面はアプリ側 (Expo 共通の login 画面) が出す。
// データは /api/* が認証必須なので未ログインでは何も見えない。
import { Hono } from "hono";
import { authApp, authMiddleware } from "./auth";
import { recordsApp } from "./routes/records";
import { qrApp } from "./routes/qr";
import type { AppEnv } from "./env";

const app = new Hono<AppEnv>();

app.route("/api/auth", authApp);

app.use("/api/*", authMiddleware);

app.get("/api/me", (c) => c.json(c.var.user));
app.route("/api/records", recordsApp);
app.route("/api/qr", qrApp);

// SPA アセット (存在しないパスは not_found_handling: single-page-application で index.html)
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

export default app;
