#!/usr/bin/env bash
# Android実機のMetro接続先をこのMacのLAN IPに書き込む(Mac上でUSB接続して実行)。
# health-assistant から移植。
#
# 位置づけ: **復旧手段**。RNデバッグビルドの既定の接続先は localhost:8081(= adb reverse前提)
# だが、adb reverse トンネルが不安定な環境では応答が来ないままアプリが無言でスプラッシュ
# 固まりする(readTimeout が無限のため)。アプリの SharedPreferences にある
# debug_http_host(接続先の最優先オーバーライド)へ Mac の LAN IP を書き込み、Wi-Fi直結にする。
#
# 前提: **アプリがインストール済みであること**(run-as はインストール済みのデバッグ版
# アプリ領域にしか入れない)。したがってビルド前ではなく、ビルド後に実行する。
#
# 使い方:
#   npm run android:metro-host              # IPを自動検出(en0→en1)
#   npm run android:metro-host -- 192.168.x.x  # 手動指定
set -euo pipefail

PKG="com.goma_b.okusuri"
PORT=8081
HOST="${1:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"

if [ -z "$HOST" ]; then
  echo "MacのLAN IPを自動検出できませんでした。手動で指定してください:" >&2
  echo "  npm run android:metro-host -- 192.168.x.x" >&2
  exit 1
fi

if ! adb get-state >/dev/null 2>&1; then
  echo "Android実機が見つかりません。USBで接続してUSBデバッグを有効にしてください。" >&2
  exit 1
fi

if ! adb shell pm list packages | grep -q "^package:${PKG}$"; then
  echo "アプリ($PKG)が実機にインストールされていません。" >&2
  echo "先に 'npm run device:android' でインストールしてから、もう一度実行してください。" >&2
  exit 1
fi

TMP="$(mktemp)"
cat > "$TMP" <<EOF
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="debug_http_host">${HOST}:${PORT}</string>
</map>
EOF

# run-as はデバッグビルドのアプリ領域にのみ入れる。直接pushできないので/data/local/tmp経由。
adb push "$TMP" /data/local/tmp/rn-debug-http-host.xml >/dev/null
adb shell "run-as $PKG sh -c 'mkdir -p shared_prefs && cp /data/local/tmp/rn-debug-http-host.xml shared_prefs/${PKG}_preferences.xml'"
adb shell rm /data/local/tmp/rn-debug-http-host.xml
adb shell am force-stop "$PKG" || true
rm -f "$TMP"

echo "Metro接続先を ${HOST}:${PORT} に設定しました。"
echo "'npm start' でMetroを起動し、実機でアプリを開いてください(以降はUSB不要・Wi-Fi接続)。"
