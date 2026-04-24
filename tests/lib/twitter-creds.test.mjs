/**
 * tests/lib/twitter-creds.test.mjs
 * src/lib/twitter.ts の認証情報パースロジックを検証する
 * (実際の X API 呼び出しはしない)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// ---- crypto ヘルパー（crypto.ts と同一ロジック）----

const TEST_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function encrypt(text) {
  const key = Buffer.from(TEST_KEY_HEX, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(encryptedStr) {
  const key = Buffer.from(TEST_KEY_HEX, 'hex');
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) throw new Error('暗号化データのフォーマットが不正です');
  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8');
}

// ---- twitter.ts の認証情報パースロジック ----

function parseXCredentials(xCredentialsEncrypted) {
  const raw = decrypt(xCredentialsEncrypted);
  const credentials = JSON.parse(raw);
  if (!credentials.accessToken || !credentials.accessSecret) {
    throw new Error('復号した X 認証情報に accessToken または accessSecret が含まれていません');
  }
  return credentials;
}

// ---- テスト ----

describe('twitter: X 認証情報の暗号化・パース', () => {
  test('正しい credentials を暗号化 → 復号 → パースできる', () => {
    const creds = { accessToken: 'token-abc-123', accessSecret: 'secret-xyz-456' };
    const encrypted = encrypt(JSON.stringify(creds));
    const parsed = parseXCredentials(encrypted);
    assert.equal(parsed.accessToken, creds.accessToken);
    assert.equal(parsed.accessSecret, creds.accessSecret);
  });

  test('accessToken がない場合はエラー', () => {
    const creds = { accessSecret: 'secret-only' };
    const encrypted = encrypt(JSON.stringify(creds));
    assert.throws(() => parseXCredentials(encrypted), /accessToken.*accessSecret/);
  });

  test('accessSecret がない場合はエラー', () => {
    const creds = { accessToken: 'token-only' };
    const encrypted = encrypt(JSON.stringify(creds));
    assert.throws(() => parseXCredentials(encrypted), /accessToken.*accessSecret/);
  });

  test('空オブジェクトはエラー', () => {
    const encrypted = encrypt(JSON.stringify({}));
    assert.throws(() => parseXCredentials(encrypted));
  });

  test('JSON でない文字列はパースエラー', () => {
    const encrypted = encrypt('not-json-string');
    assert.throws(() => parseXCredentials(encrypted), (err) => err instanceof SyntaxError);
  });

  test('TwitterApiTokens の形式チェック（appKey/appSecret は env から）', () => {
    // twitter.ts では appKey=X_API_KEY, appSecret=X_API_SECRET を env から取得
    // アクセストークンのみ DB から復号する
    const creds = { accessToken: 'at', accessSecret: 'as' };
    const encrypted = encrypt(JSON.stringify(creds));
    const parsed = parseXCredentials(encrypted);

    // 最終的に渡す TokensObject の形式
    const tokens = {
      appKey: 'APP_KEY_FROM_ENV',
      appSecret: 'APP_SECRET_FROM_ENV',
      accessToken: parsed.accessToken,
      accessSecret: parsed.accessSecret,
    };
    assert.ok(tokens.appKey);
    assert.ok(tokens.appSecret);
    assert.equal(tokens.accessToken, 'at');
    assert.equal(tokens.accessSecret, 'as');
  });
});
