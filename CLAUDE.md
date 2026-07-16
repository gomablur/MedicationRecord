# CLAUDE.md — AI アシスタント向けプロジェクトメモ

お薬手帳アプリ: 処方薬の記録・確認 + JAHIS QR 取り込み。iOS / Android / Web 対応の個人向けアプリ。

## まず読むもの

- [README.md](README.md) — 構成・セットアップ・デプロイ手順
- [server/README.md](server/README.md) / [app/README.md](app/README.md) — 各パッケージのマップとコマンド
- [docs/jahis-qr-format.md](docs/jahis-qr-format.md) — QR パーサーの実装根拠 (JAHIS 仕様の要約)
- [docs/ROADMAP.md](docs/ROADMAP.md) — マイナ連携・ヘルスアプリ連携の調査メモ (未実装の理由込み)

## 構成の要点

- `server/` — 1 Worker 構成: Hono API (`/api/*`) + Workers Static Assets (Expo web export)。
  SPA は未ログインでも配信してよい (ユーザー方針。ログイン画面は Expo 共通の login.tsx)。
  データ API は全て authMiddleware で保護
- `app/` — Expo 57 / expo-router。Web は同一オリジンでクッキー認証、
  ネイティブは Bearer トークン (SecureStore) + `okusuri://auth#token=` コールバック
- ルート package.json は便利スクリプトのみ。**意図的に npm workspaces にしていない**
  (Expo/Metro の hoisting 問題回避 + デプロイ単位が別)。install は各ディレクトリで行う
- DB: D1 + Drizzle。スキーマの正は `server/src/db/schema.ts` (migrations/ はそこから生成)
- ID は UUIDv7。入力検証は Zod (`server/src/schemas.ts`)。
  **API の型を変えたら `app/src/api/types.ts` (手書きミラー) も直すこと**
- QR 解析はサーバー側 (`server/src/jahis/parser.ts`、テスト付き)。
  流れ: `POST /api/qr/parse` → draft 返却 → クライアントで確認 → `POST /api/records`
- お試しモード (`app/src/api/mock.ts`): サーバー不要の端末内モック。
  `EXPO_PUBLIC_ENABLE_MOCK=1` のビルド限定 (CI はリポジトリ変数で制御、未設定なら現状オン)。
  QR 解析の簡易実装はサーバーのパーサーの代替ではない (本解析は必ずサーバーで)

## ハマりどころ (参考実装から継承した知見)

- **D1 は 1 クエリ 100 SQL 変数まで** → `util.ts` の `chunks()/VAR_CHUNK` で分割済み。新しい IN 句・一括 INSERT でも必ず使う
- Drizzle の sql`` 相関サブクエリで `${table.column}` は未修飾カラムになる → 2 段クエリにするか列名リテラルで書く
- Secure クッキーは http では保存されない → auth.ts は https のときだけ `secure` を付ける
- 確認ダイアログは OS 標準 (`utils/confirm.ts`: ネイティブ=Alert / Web=window.confirm)。
  **PWA (ホーム画面追加) は想定しない**方針のため window.confirm でよい (ユーザー確認済み)。
  PWA 化するなら iOS で confirm が効かない問題があるので 2 タップ確認方式に戻すこと
- `npm audit fix --force` 禁止 (drizzle-kit が壊れる)
- Expo: ネイティブ SDK の import は `native.*.ts` に隔離 / `ios/` `android/` は CNG 管理でコミットしない /
  `EXPO_UNSTABLE_HEADLESS=1` 使用禁止

## 本番環境

- `okusuri.goma-b.com` (カスタムドメイン)。`workers_dev: false` / `preview_urls: false` は**維持すること**(ユーザー方針)
- main への push = 本番デプロイ (GH Actions がマイグレーション適用まで行う)
- シークレット: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / JWT_SECRET (wrangler secret)。
  任意で APPLE_TEAM_ID / APPLE_CLIENT_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY (Apple ログイン。
  未設定なら自動で無効、ボタンも出ない)。ログインボタンの出し分けは `/api/auth/providers`
- アカウント連携: Apple の「メールを非公開」対策として、設定画面からログイン中ユーザーに
  別プロバイダの sub を紐づけられる (`/api/auth/*/link`)。既に別ユーザーが持つ sub とは
  連携できない (アカウント統合はしない方針)
- ネイティブビルドはユーザーが Mac 側で実施 (コンテナからは不可)

## 作業ルール

- コードコメント・ドキュメント・UI 文言は日本語
- コミットメッセージは日本語 conventional 形式 (`feat:` / `fix:` …)、フッターに `Co-Authored-By:` トレーラー
- 検証: `cd server && npm test && npm run typecheck` / `cd app && npm run typecheck`。
  ローカル E2E は `server: npm run dev` + 開発用ログイン (`/api/auth/dev`)
- 医療データを扱うため: 診断・医学的判断をする機能は作らない (表示は記録の再掲に徹する)。
  外部サービスへ薬剤データを送る機能を足すときは必ずユーザーに確認を取る
