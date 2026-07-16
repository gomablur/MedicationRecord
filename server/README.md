# server — Cloudflare Worker (API + Web 配信)

Hono + D1 (Drizzle) の 1 Worker 構成。`/api/*` の JSON API と、
Expo web export (`public/`) の静的配信を兼ねる。全体像はリポジトリルートの
[README](../README.md)、開発メモは [CLAUDE.md](../CLAUDE.md) を参照。

## ディレクトリマップ

```
src/
  index.ts        Worker エントリ (ルーティング合成・アセット配信)
  env.ts          Bindings / AppEnv 型 (シークレット追加時はここも更新)
  auth.ts         Google/Apple OAuth・開発用ログイン・authMiddleware
  apple.ts        Sign in with Apple (client_secret 生成・コード交換)
  schemas.ts      Zod 入力スキーマ (app/src/api/types.ts と手動で同期)
  util.ts         chunks()/VAR_CHUNK — D1 の 100 変数制限対策
  db/schema.ts    Drizzle スキーマ (これが正。migrations/ はここから生成)
  jahis/parser.ts JAHIS お薬手帳 QR パーサー (docs/jahis-qr-format.md 参照)
  routes/
    records.ts    調剤記録 CRUD + 検索
    qr.ts         POST /api/qr/parse (解析のみ。保存は records)
migrations/       D1 マイグレーション SQL (drizzle-kit generate の出力)
public/           Expo web export のコピー先 (gitignore。CI が生成)
scripts/predev.mjs  dev 前準備 (public/ プレースホルダ・.dev.vars 作成)
```

## コマンド

```bash
npm run dev               # wrangler dev (http://localhost:8787)
npm test                  # vitest (JAHIS パーサー / Apple JWT)
npm run typecheck
npm run db:generate       # schema.ts → migrations/ に SQL 生成
npm run db:migrate:local  # ローカル D1 へ適用
npm run db:migrate:remote # 本番 D1 へ適用 (通常は CI に任せる)
```

- ローカルの認証は `.dev.vars` の `DEV_AUTH=true` により
  `GET /api/auth/dev` (Google 不要) が使える。curl は
  `curl -c /tmp/jar -L http://localhost:8787/api/auth/dev` でクッキー取得
- ローカル D1 の実体は `.wrangler/state/` (wrangler.jsonc の database_id を変えると新規になる)

## API 一覧 (認証必須。/api/auth/* を除く)

| メソッド/パス | 内容 |
|---|---|
| GET /api/auth/providers | 設定済みログイン方法 (認証不要) |
| GET /api/auth/google, /google/native | Google ログイン (native はトークンをスキームで返す) |
| GET /api/auth/apple, /apple/native, POST /apple/callback | Apple ログイン |
| GET /api/auth/dev | 開発用ログイン (DEV_AUTH=true のみ。?native=1 で JSON) |
| POST /api/auth/logout | クッキー削除 |
| GET /api/me | ログイン中ユーザー |
| GET /api/records?q= | 記録一覧 (調剤日降順、薬名・薬局名検索) |
| POST /api/records | 記録作成 |
| GET/PUT/DELETE /api/records/:id | 記録の取得・更新 (薬は全置換)・削除 |
| POST /api/qr/parse | JAHIS QR / 移行ファイル解析 → 下書き (複数可) 返却。分割 QR は needsMore |

## シークレット (wrangler secret put)

必須: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `JWT_SECRET`
任意: `APPLE_TEAM_ID` / `APPLE_CLIENT_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` (Apple ログイン)

## デプロイ

main への push で GitHub Actions が「テスト → web export → D1 マイグレーション → deploy」を実行する
([.github/workflows/deploy.yml](../.github/workflows/deploy.yml))。手動デプロイは
`npm run build:web` (ルート) → `cd server && npm run deploy`。
