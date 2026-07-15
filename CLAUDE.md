# CLAUDE.md — AI アシスタント向けプロジェクトメモ

お薬手帳アプリ: 処方薬の記録・確認 + JAHIS QR 取り込み。iOS / Android / Web 対応の個人向けアプリ。

## まず読むもの

- [README.md](README.md) — 構成・セットアップ・デプロイ手順
- [docs/jahis-qr-format.md](docs/jahis-qr-format.md) — QR パーサーの実装根拠 (JAHIS 仕様の要約)
- [docs/ROADMAP.md](docs/ROADMAP.md) — マイナ連携・ヘルスアプリ連携の調査メモ (未実装の理由込み)

## 構成の要点

- `server/` — 1 Worker 構成: Hono API (`/api/*`) + Workers Static Assets (Expo web export)。
  未ログインには SPA を配信しない (`run_worker_first` + ログインページ)
- `app/` — Expo 57 / expo-router。Web は同一オリジンでクッキー認証、
  ネイティブは Bearer トークン (SecureStore) + `okusuri://auth#token=` コールバック
- DB: D1 + Drizzle。スキーマの正は `server/src/db/schema.ts` (migrations/ はそこから生成)
- ID は UUIDv7。入力検証は Zod (`server/src/schemas.ts`)。
  **API の型を変えたら `app/src/api/types.ts` (手書きミラー) も直すこと**
- QR 解析はサーバー側 (`server/src/jahis/parser.ts`、テスト付き)。
  流れ: `POST /api/qr/parse` → draft 返却 → クライアントで確認 → `POST /api/records`

## ハマりどころ (参考実装から継承した知見)

- **D1 は 1 クエリ 100 SQL 変数まで** → `util.ts` の `chunks()/VAR_CHUNK` で分割済み。新しい IN 句・一括 INSERT でも必ず使う
- Drizzle の sql`` 相関サブクエリで `${table.column}` は未修飾カラムになる → 2 段クエリにするか列名リテラルで書く
- Secure クッキーは http では保存されない → auth.ts は https のときだけ `secure` を付ける
- iOS PWA では `window.confirm` が動かないことがある → アプリ側は 2 タップ確認 (ConfirmButton)
- `npm audit fix --force` 禁止 (drizzle-kit が壊れる)
- Expo: ネイティブ SDK の import は `native.*.ts` に隔離 / `ios/` `android/` は CNG 管理でコミットしない /
  `EXPO_UNSTABLE_HEADLESS=1` 使用禁止

## 本番環境

- `okusuri.goma-b.com` (カスタムドメイン)。`workers_dev: false` / `preview_urls: false` は**維持すること**(ユーザー方針)
- main への push = 本番デプロイ (GH Actions がマイグレーション適用まで行う)
- シークレット: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / JWT_SECRET (wrangler secret)
- ネイティブビルドはユーザーが Mac 側で実施 (コンテナからは不可)

## 作業ルール

- コードコメント・ドキュメント・UI 文言は日本語
- コミットメッセージは日本語 conventional 形式 (`feat:` / `fix:` …)、フッターに `Co-Authored-By:` トレーラー
- 検証: `cd server && npm test && npm run typecheck` / `cd app && npm run typecheck`。
  ローカル E2E は `server: npm run dev` + 開発用ログイン (`/api/auth/dev`)
- 医療データを扱うため: 診断・医学的判断をする機能は作らない (表示は記録の再掲に徹する)。
  外部サービスへ薬剤データを送る機能を足すときは必ずユーザーに確認を取る
