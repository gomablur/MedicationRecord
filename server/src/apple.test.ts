import { describe, expect, it } from "vitest";
import {
  buildAppleClientSecret,
  buildAppleAuthUrl,
  decodeJwtPayload,
  parseAppleUserField,
  type AppleConfig,
} from "./apple";

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** テスト用に P-256 鍵ペアを生成し、秘密鍵を PKCS#8 PEM で返す */
async function generateTestKey(): Promise<{ pem: string; publicKey: CryptoKey }> {
  // workers-types の generateKey は union 型を返すため CryptoKeyPair に絞る
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pkcs8 = (await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer;
  const b64 = bytesToB64(new Uint8Array(pkcs8));
  const lines = b64.match(/.{1,64}/g)!.join("\n");
  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`,
    publicKey: pair.publicKey,
  };
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

describe("buildAppleClientSecret", () => {
  it("kid 付き ES256 JWT を生成し、署名が検証できる", async () => {
    const { pem, publicKey } = await generateTestKey();
    const config: AppleConfig = {
      teamId: "TEAM123456",
      clientId: "com.example.web",
      keyId: "KEY1234567",
      privateKey: pem,
    };
    const now = 1_752_000_000_000;
    const jwt = await buildAppleClientSecret(config, now);
    const [headerPart, payloadPart, sigPart] = jwt.split(".");
    expect(headerPart && payloadPart && sigPart).toBeTruthy();

    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerPart!)));
    expect(header).toEqual({ alg: "ES256", kid: "KEY1234567", typ: "JWT" });

    const payload = decodeJwtPayload(jwt);
    expect(payload.iss).toBe("TEAM123456");
    expect(payload.sub).toBe("com.example.web");
    expect(payload.aud).toBe("https://appleid.apple.com");
    expect(payload.iat).toBe(Math.floor(now / 1000));
    expect(payload.exp).toBe(Math.floor(now / 1000) + 3600);

    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      b64urlToBytes(sigPart!),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
    expect(ok).toBe(true);
  });
});

describe("buildAppleAuthUrl", () => {
  it("必要なパラメータを含む認可 URL を組み立てる", () => {
    const url = new URL(
      buildAppleAuthUrl(
        { teamId: "T", clientId: "com.example.web", keyId: "K", privateKey: "" },
        "https://okusuri.example.com/api/auth/apple/callback",
        "STATE123",
      ),
    );
    expect(url.origin).toBe("https://appleid.apple.com");
    expect(url.searchParams.get("client_id")).toBe("com.example.web");
    expect(url.searchParams.get("response_mode")).toBe("form_post");
    expect(url.searchParams.get("scope")).toBe("name email");
    expect(url.searchParams.get("state")).toBe("STATE123");
  });
});

describe("parseAppleUserField", () => {
  it("初回認可の user フィールドから姓名を組み立てる", () => {
    const json = JSON.stringify({ name: { firstName: "太郎", lastName: "鈴木" }, email: "t@example.com" });
    expect(parseAppleUserField(json)).toBe("鈴木 太郎");
  });
  it("欠損や不正 JSON は undefined", () => {
    expect(parseAppleUserField(undefined)).toBeUndefined();
    expect(parseAppleUserField("{broken")).toBeUndefined();
    expect(parseAppleUserField("{}")).toBeUndefined();
  });
});
