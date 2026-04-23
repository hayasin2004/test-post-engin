/**
 * tests/api/personas-api-logic.test.mjs
 * /api/personas のバリデーションロジックをモックで検証する
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ---- バリデーションロジックの再現 ----

function validatePersonaInput(body) {
  if (!body) return '本文が空です';
  const { name, tone, topics, accessToken, accessSecret } = body;
  if (!name || !tone) return 'name / tone は必須です';
  if (!Array.isArray(topics) || topics.length === 0) return 'topics は1件以上必要です';
  if (!accessToken || !accessSecret) return 'accessToken / accessSecret は必須です';
  return null; // バリデーション通過
}

async function createPersonaLogic(body, encryptFn, insertFn) {
  const validationError = validatePersonaInput(body);
  if (validationError) return { status: 400, error: validationError };

  const { name, tone, topics, accessToken, accessSecret } = body;

  let encrypted;
  try {
    encrypted = encryptFn(JSON.stringify({ accessToken, accessSecret }));
  } catch (err) {
    return { status: 500, error: `暗号化に失敗しました: ${err.message}` };
  }

  try {
    const persona = await insertFn({ name, tone, topics, x_credentials_encrypted: encrypted });
    return { status: 201, persona };
  } catch (err) {
    return { status: 500, error: err.message };
  }
}

// ---- モック ----
// Base64 で変換して「元の平文が残らない」形式を再現する
const mockEncrypt = (text) => Buffer.from(text).toString('base64');
const mockInsert  = async (data) => ({ id: 'new-uuid', ...data, created_at: '2026-04-24T00:00:00Z' });

// ---- テスト: バリデーション ----

describe('personas API: 入力バリデーション', () => {
  test('name が空ならエラー', () => {
    const err = validatePersonaInput({ name: '', tone: 'テック', topics: ['AI'], accessToken: 't', accessSecret: 's' });
    assert.ok(err);
  });

  test('tone が空ならエラー', () => {
    const err = validatePersonaInput({ name: 'A', tone: '', topics: ['AI'], accessToken: 't', accessSecret: 's' });
    assert.ok(err);
  });

  test('topics が空配列ならエラー', () => {
    const err = validatePersonaInput({ name: 'A', tone: 'B', topics: [], accessToken: 't', accessSecret: 's' });
    assert.ok(err);
  });

  test('topics が配列でないならエラー', () => {
    const err = validatePersonaInput({ name: 'A', tone: 'B', topics: 'AI', accessToken: 't', accessSecret: 's' });
    assert.ok(err);
  });

  test('accessToken が空ならエラー', () => {
    const err = validatePersonaInput({ name: 'A', tone: 'B', topics: ['AI'], accessToken: '', accessSecret: 's' });
    assert.ok(err);
  });

  test('accessSecret が空ならエラー', () => {
    const err = validatePersonaInput({ name: 'A', tone: 'B', topics: ['AI'], accessToken: 't', accessSecret: '' });
    assert.ok(err);
  });

  test('正常入力はバリデーション通過（null を返す）', () => {
    const err = validatePersonaInput({ name: 'A', tone: 'B', topics: ['AI'], accessToken: 't', accessSecret: 's' });
    assert.strictEqual(err, null);
  });
});

describe('personas API: 正常な作成フロー', () => {
  const validBody = {
    name: 'テック太郎',
    tone: 'テック寄り',
    topics: ['AI', 'TypeScript'],
    accessToken: 'token123',
    accessSecret: 'secret456',
  };

  test('正常なリクエストで 201 が返る', async () => {
    const res = await createPersonaLogic(validBody, mockEncrypt, mockInsert);
    assert.equal(res.status, 201);
  });

  test('レスポンスに persona が含まれる', async () => {
    const res = await createPersonaLogic(validBody, mockEncrypt, mockInsert);
    assert.ok(res.persona);
    assert.equal(res.persona.name, 'テック太郎');
  });

  test('X 認証情報は暗号化されて保存される（平文が残らない）', async () => {
    const res = await createPersonaLogic(validBody, mockEncrypt, mockInsert);
    // Base64 変換後は元の token 文字列が含まれない
    assert.ok(!res.persona.x_credentials_encrypted.includes('token123'));
    assert.ok(!res.persona.x_credentials_encrypted.includes('secret456'));
    // 元の入力とは異なる文字列になっている
    assert.notEqual(res.persona.x_credentials_encrypted, validBody.accessToken);
  });
});

describe('personas API: エラーハンドリング', () => {
  const validBody = {
    name: 'A', tone: 'B', topics: ['C'],
    accessToken: 't', accessSecret: 's',
  };

  test('バリデーションエラーは 400 を返す', async () => {
    const res = await createPersonaLogic(
      { name: '', tone: 'B', topics: ['C'], accessToken: 't', accessSecret: 's' },
      mockEncrypt, mockInsert
    );
    assert.equal(res.status, 400);
  });

  test('暗号化エラーは 500 を返す', async () => {
    const failEncrypt = () => { throw new Error('key error'); };
    const res = await createPersonaLogic(validBody, failEncrypt, mockInsert);
    assert.equal(res.status, 500);
    assert.ok(res.error.includes('暗号化'));
  });

  test('DB エラーは 500 を返す', async () => {
    const failInsert = async () => { throw new Error('DB constraint'); };
    const res = await createPersonaLogic(validBody, mockEncrypt, failInsert);
    assert.equal(res.status, 500);
  });
});
