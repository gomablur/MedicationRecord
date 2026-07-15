// Sign in with Apple (Web ベースの OAuth フロー) のヘルパー群。
//
// Apple の特殊事情:
//   - client_secret は固定値ではなく、開発者の秘密鍵 (.p8, ES256) で署名した
//     短命 JWT をその都度生成する
//   - scope を要求する場合 response_mode=form_post 固定 (コールバックは POST)
//   - ユーザー名は初回認可時の `user` フォームフィールドにしか入ってこない
//   - メールは「プライベートリレー」(@privaterelay.appleid.com) の場合がある
//
// id_token は Apple のトークンエンドポイントから TLS で直接受け取るため、
// 署名検証は省略してペイロードのデコードのみ行う (認可コードの検証は Apple 側で済んでいる)。

export type AppleConfig = {
  teamId: string;
  /** Services ID (Web 用のクライアント ID。例: com.goma-b.okusuri.web) */
  clientId: string;
  keyId: string;
  /** .p8 の中身 (PKCS#8 PEM) */
  privateKey: string;
};

const APPLE_AUTH_URL = "https://appleid.apple.com/auth/authorize";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";

function base64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * client_secret 用の JWT を生成する (ES256、ヘッダーに kid 必須)。
 * WebCrypto の ECDSA 署名は JWS がそのまま要求する raw (r||s) 形式で返る。
 */
export async function buildAppleClientSecret(config: AppleConfig, now = Date.now()): Promise<string> {
  const header = { alg: "ES256", kid: config.keyId, typ: "JWT" };
  const iat = Math.floor(now / 1000);
  const payload = {
    iss: config.teamId,
    iat,
    exp: iat + 60 * 60, // 1時間 (Apple の上限は6ヶ月)
    aud: "https://appleid.apple.com",
    sub: config.clientId,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(config.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

/** 認可エンドポイントへのリダイレクト URL を組み立てる */
export function buildAppleAuthUrl(config: AppleConfig, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "form_post", // scope 指定時は form_post 固定
    scope: "name email",
    state,
  });
  return `${APPLE_AUTH_URL}?${params}`;
}

export type AppleProfile = {
  /** Apple のユーザー識別子 (アプリ横断で不変) */
  sub: string;
  email?: string;
};

/** JWT のペイロード部をデコードする (署名検証なし。用途は上記コメント参照) */
export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("JWT の形式が不正です");
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

/** 認可コードをトークンに交換し、id_token から sub / email を取り出す */
export async function exchangeAppleCode(
  config: AppleConfig,
  code: string,
  redirectUri: string,
): Promise<AppleProfile> {
  const clientSecret = await buildAppleClientSecret(config);
  const res = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apple トークン交換に失敗: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Apple のレスポンスに id_token がありません");

  const payload = decodeJwtPayload(data.id_token);
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  if (!sub) throw new Error("id_token に sub がありません");
  return {
    sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}

/** 初回認可時のみ渡ってくる `user` フォームフィールドから氏名を取り出す */
export function parseAppleUserField(userJson: string | undefined): string | undefined {
  if (!userJson) return undefined;
  try {
    const user = JSON.parse(userJson) as { name?: { firstName?: string; lastName?: string } };
    const name = [user.name?.lastName, user.name?.firstName].filter(Boolean).join(" ");
    return name || undefined;
  } catch {
    return undefined;
  }
}
