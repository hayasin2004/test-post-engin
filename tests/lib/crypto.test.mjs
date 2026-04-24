/**
 * tests/lib/crypto.test.mjs
 * src/lib/crypto.ts の AES-256-GCM 暗号化/復号ロジックを検証する
 * （ロジックをインライン再現 — TypeScript インポート不要）
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// ---- 再現ロジック ----

const TEST_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function encrypt(text, keyHex = TEST_KEY_HEX) {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(encryptedStr, keyHex = TEST_KEY_HEX) {
  const key = Buffer.from(keyHex, 'hex');
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) throw new Error('暗号化データのフォーマットが不正です');
  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8');
}

// ---- テスト ----

describe('crypto: AES-256-GCM 基本動作', () => {
  test('encrypt → decrypt ラウンドトリップ（ASCII）', () => {
    const original = 'hello world test123!@#';
    assert.equal(decrypt(encrypt(original)), original);
  });

  test('encrypt → decrypt ラウンドトリップ（日本語）', () => {
    const original = 'テスト文字列：日本語も暗号化できる';
    assert.equal(decrypt(encrypt(original)), original);
  });

  test('JSON 文字列のラウンドトリップ（twitter.ts の用途）', () => {
    const creds = { accessToken: 'tok-abc-123', accessSecret: 'sec-xyz-456' };
    const enc = encrypt(JSON.stringify(creds));
    const dec = JSON.parse(decrypt(enc));
    assert.deepEqual(dec, creds);
  });

  test('空文字列のラウンドトリップ', () => {
    assert.equal(decrypt(encrypt('')), '');
  });
});

describe('crypto: 出力フォーマット', () => {
  test('結果が iv:authTag:ciphertext の3パート形式', () => {
    const parts = encrypt('test').split(':');
    assert.equal(parts.length, 3);
  });

  test('IV は 12 バイト = 24 文字の hex', () => {
    const [iv] = encrypt('test').split(':');
    assert.match(iv, /^[0-9a-f]{24}$/);
  });

  test('AuthTag は 16 バイト = 32 文字の hex', () => {
    const [, authTag] = encrypt('test').split(':');
    assert.match(authTag, /^[0-9a-f]{32}$/);
  });

  test('同じ文字列でも暗号化のたびに IV が変わるため結果が異なる', () => {
    const text = 'same text always different result';
    assert.notEqual(encrypt(text), encrypt(text));
  });
});

describe('crypto: エラーケース', () => {
  test('フォーマット不正な文字列を復号するとエラー', () => {
    assert.throws(() => decrypt('invalid-no-colon'), /フォーマットが不正/);
  });

  test('パートが2つしかない場合もエラー', () => {
    assert.throws(() => decrypt('part1:part2'), /フォーマットが不正/);
  });

  test('短い鍵（32バイト未満）は AES-256 でエラー', () => {
    assert.throws(() => encrypt('test', 'tooshort'), (err) => {
      return err instanceof Error;
    });
  });

  test('改ざんされた ciphertext の復号は authTag 検証でエラー', () => {
    const enc = encrypt('original text');
    const parts = enc.split(':');
    // ciphertext 部分を改ざん
    parts[2] = parts[2].replace(/.$/, parts[2].slice(-1) === 'f' ? '0' : 'f');
    assert.throws(() => decrypt(parts.join(':')));
  });
});
