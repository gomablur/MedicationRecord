# お薬手帳 (MedicationRecord)

処方されたお薬を記録・確認する個人向けお薬手帳アプリ。
iOS / Android / Web のどこからでも同じデータを参照できる。

## 機能

- **薬の記録・確認**: 調剤ごとの記録 (調剤日・薬局・処方元・薬の一覧) を作成・閲覧・検索・編集
- **QR 取り込み**: 薬局の明細等に印字される JAHIS 電子版お薬手帳 QR コードを読み取って自動登録
  (分割 QR 対応。フォーマットは [docs/jahis-qr-format.md](docs/jahis-qr-format.md))
- **移行データの取り込み (Web)**: 他のお薬手帳アプリから書き出した JAHIS 形式ファイルを
  複数まとめてアップロード可能 (Shift_JIS/UTF-8 自動判別)。複数調剤は調剤日ごとに
  別の記録として一括保存される
- **Google / Apple アカウントでログイン (OAuth2)**: 誰でも登録でき、記録はユーザーごとに分離。
  どの端末からログインしても同じ記録を参照できる (Apple はシークレット設定時のみ有効)。
  設定画面の「アカウント連携」で両方を紐づけられる (Apple の「メールを非公開」で
  メールアドレスが一致しなくても連携可能)
- **お試しモード**: ログイン不要・サーバー不要で、端末内のサンプルデータで全機能を試せる。
  ビルド時に `EXPO_PUBLIC_ENABLE_MOCK=1` を指定したときだけログイン画面にボタンが出る
  (CI では リポジトリ変数 `EXPO_PUBLIC_ENABLE_MOCK` で制御、未設定なら当面オン)

将来対応 (拡張ポイントとして設計のみ): マイナポータル連携、OS ヘルスアプリ連携
([docs/ROADMAP.md](docs/ROADMAP.md) 参照)。

## 構成

```
app/     Expo (expo-router)。iOS / Android / Web の 3 プラットフォーム共通クライアント
server/  Cloudflare Workers。Hono + D1 (Drizzle) の API と、Expo web export の静的配信を 1 Worker で担う
docs/    ドキュメント
```

- 認証: Google OAuth2。Web は HttpOnly クッキー、ネイティブは Bearer トークン (SecureStore 保存)
- ログイン画面は Expo 共通 (Web もアプリ内の login 画面)。SPA は未ログインでも配信するが、
  データ API (`/api/*`) はすべて認証必須
- 本番: `okusuri.goma-b.com` (Worker のカスタムドメイン。workers.dev は無効化)

## 開発 (DevContainer 内で完結するもの)

```bash
# API サーバー (http://localhost:8787)
cd server
npm install
npm run db:migrate:local   # 初回のみ: ローカル D1 にスキーマ適用
npm run dev                # ログインは「開発用ログイン」(Google 不要) が使える

# アプリ (Web で UI 確認)
cd app
npm install
npm run web                # Expo の開発サーバー (API は EXPO_PUBLIC_API_URL で指定)

# 検証
cd server && npm test && npm run typecheck
cd app && npm run typecheck
```

curl で API を叩くときは開発用ログインでクッキーを取るのが楽:

```bash
curl -c /tmp/jar -L http://localhost:8787/api/auth/dev   # 以降 -b /tmp/jar
```

## 本番セットアップ (初回のみ・手作業)

1. **D1 作成**: `cd server && npx wrangler d1 create okusuri-db`
   → 出力された `database_id` を [server/wrangler.jsonc](server/wrangler.jsonc) に反映
2. **カスタムドメイン**: wrangler.jsonc の `routes` が `okusuri.goma-b.com` を指定済み
   (goma-b.com ゾーンが同アカウントにあれば初回デプロイで自動設定される)
3. **Google OAuth クライアント作成** (Google Cloud Console):
   - 承認済みリダイレクト URI: `https://okusuri.goma-b.com/api/auth/google`
4. **シークレット登録**:
   ```bash
   cd server
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put JWT_SECRET        # 例: openssl rand -base64 32
   ```
5. **(任意) Sign in with Apple** — 未設定なら Apple ボタンは表示されない:
   - Apple Developer で App ID + **Services ID** (例: `com.goma-b.okusuri.web`) を作成し、
     Sign in with Apple を有効化。Return URL: `https://okusuri.goma-b.com/api/auth/apple/callback`、
     ドメイン: `okusuri.goma-b.com`
   - 「Sign in with Apple 用キー」(.p8) を作成し、以下を登録:
   ```bash
   npx wrangler secret put APPLE_TEAM_ID      # 開発者アカウントの Team ID
   npx wrangler secret put APPLE_CLIENT_ID    # Services ID
   npx wrangler secret put APPLE_KEY_ID       # キーの Key ID
   npx wrangler secret put APPLE_PRIVATE_KEY  # .p8 ファイルの中身をそのまま貼り付け
   ```
5. **GitHub Actions の Secrets** (リポジトリ設定 → Environments `production` 推奨):
   - `CLOUDFLARE_API_TOKEN` (Workers + D1 編集権限)
   - `CLOUDFLARE_ACCOUNT_ID`

## デプロイ

**main へ push すると GitHub Actions が本番デプロイまで行う**
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)):
テスト → Expo web export → D1 マイグレーション適用 → Worker デプロイ。
PR ではビルド検証まで。

## ネイティブビルド (Mac 側の作業)

iOS / Android の実機ビルドはコンテナからは行えない。Mac で:

```bash
cd app
npm install
npx expo run:ios --device       # または npx expo run:android
```

- `ios/` `android/` は CNG (prebuild) 管理。コミットしない
- 開発ビルドでローカル API に繋ぐ場合は `EXPO_PUBLIC_API_URL=http://<コンテナのLAN IP>:8787`
  を指定するか、アプリの設定画面からサーバー URL を上書きする
