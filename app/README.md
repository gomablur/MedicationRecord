# app — Expo クライアント (iOS / Android / Web)

expo-router 構成のお薬手帳クライアント。Web ビルドは server/ の Worker が配信する。
全体像はリポジトリルートの [README](../README.md)、開発メモは [CLAUDE.md](../CLAUDE.md) を参照。

## ディレクトリマップ

```
src/
  app/              expo-router 画面
    _layout.tsx     ルート (SessionProvider + Stack.Protected で認証ガード)
    login.tsx       ログイン (Google/Apple/お試し。ボタンは /api/auth/providers で出し分け)
    (tabs)/         メイン3タブ: index=記録一覧 / scan=QR取り込み(Webは移行ファイルのアップロード) / settings=設定
    record/[id].tsx 記録詳細 / record/new.tsx 入力フォーム (新規・編集・QR確認)
  api/
    client.ts       fetch ラッパー (ベースURL解決・Bearer付与・401共通処理)
    records.ts      API 呼び出し (お試しモード時は mock.ts に分岐)
    types.ts        手書きの API 型 (server/src/schemas.ts と手動で同期)
    mock.ts         お試しモード (EXPO_PUBLIC_ENABLE_MOCK=1 ビルド限定)
  auth/             session.tsx (React context) / token.ts (SecureStore)
  components/       共有 UI (qr-scanner は .web.tsx で貼り付け版に分岐)
  constants/theme.ts  色・余白 (色はここからだけ取る)
  utils/            format.ts (表示整形) / confirm.ts (OS標準の確認ダイアログ)
scripts/
  gen-icons.mjs     アイコン一式の再生成 (npm run icons)
  android-metro-host.sh  Android実機のMetro接続先修復 (下記)
```

## コマンド (コンテナ内で完結するもの)

```bash
npm run web        # Web で UI 確認 (API は別途 server: npm run dev)
npm run web:mock   # お試しモード有効で起動 (サーバー不要)
npm run typecheck
npm run build:web  # dist/ に静的サイトを出力
npm run icons      # アプリアイコンを再生成
```

## 環境変数 (EXPO_PUBLIC_* はビルド時に埋め込まれる)

| 変数 | 用途 |
|---|---|
| `EXPO_PUBLIC_API_URL` | ネイティブの API 接続先 (既定: https://okusuri.goma-b.com。アプリの設定画面でも上書き可) |
| `EXPO_PUBLIC_ENABLE_MOCK` | `1` でお試しモードのボタンを表示 (本番は CI のリポジトリ変数で制御) |

## 実機ビルド (Mac 側の作業)

```bash
npm install
npm run device:ios       # または npm run device:android
```

- `ios/` `android/` は CNG (prebuild) 管理。コミットしない。
  config plugin を変えたら `npx expo prebuild -p android --no-install` で生成物を確認し、
  終わったら `rm -rf android`
- ローカル API に繋ぐ: 設定画面の「サーバー URL」に `http://<MacのLAN IP>:8787` を入力

### Android 実機が Metro に繋がらないとき

RN デバッグビルドの既定は `localhost:8081` (adb reverse 前提) だが、adb reverse が
不安定な環境ではスプラッシュで無言のまま固まる。その場合は USB 接続して:

```bash
npm run android:metro-host   # MacのLAN IPを debug_http_host に書き込み、Wi-Fi直結にする
```

詳細はスクリプト内のコメント参照 (health-assistant から移植)。
