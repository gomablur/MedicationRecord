// 未ログイン時に返す自己完結ログインページ。
// SPA のアセットは認証後にしか配信しないため、このページは外部リソースに依存しない。

export function loginPageHtml(opts: { error?: string; devAuth: boolean }): string {
  const errorHtml = opts.error
    ? `<p class="error">ログインに失敗しました。もう一度お試しください。</p>`
    : "";
  const devHtml = opts.devAuth
    ? `<a class="btn dev" href="/api/auth/dev">開発用ログイン (Google なし)</a>`
    : "";
  return `<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>お薬手帳 — ログイン</title>
<style>
  :root { color-scheme: light dark; --bg: #f4f6f8; --card: #ffffff; --fg: #1a202c; --sub: #64748b; --accent: #0e9f6e; }
  @media (prefers-color-scheme: dark) { :root { --bg: #101418; --card: #1b2129; --fg: #e8edf2; --sub: #94a3b8; } }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: var(--bg); color: var(--fg);
         font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif; }
  .card { background: var(--card); border-radius: 16px; padding: 40px 32px; width: min(90vw, 360px);
          box-shadow: 0 8px 32px rgba(0,0,0,.12); text-align: center; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .icon { font-size: 40px; }
  p.desc { color: var(--sub); font-size: 14px; margin: 8px 0 28px; }
  .btn { display: block; padding: 13px 16px; border-radius: 10px; background: var(--accent); color: #fff;
         text-decoration: none; font-weight: 600; margin-top: 12px; }
  .btn.dev { background: var(--sub); }
  .error { color: #dc2626; font-size: 13px; }
</style>
<body>
  <div class="card">
    <div class="icon">💊</div>
    <h1>お薬手帳</h1>
    <p class="desc">処方されたお薬を記録・確認できます。<br>ログインしてご利用ください。</p>
    ${errorHtml}
    <a class="btn" href="/api/auth/google">Google でログイン</a>
    ${devHtml}
  </div>
</body>
</html>`;
}
