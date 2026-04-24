/**
 * tests/api/generate-logic.test.mjs
 * /api/generate のレスポンス生成ロジックをモックデータで検証する
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ---- モックデータ ----

const MOCK_PERSONAS = [
  { id: 'p1', name: 'テック太郎', tone: 'テック寄り', topics: ['AI', 'TypeScript'] },
  { id: 'p2', name: 'カジュアル花子', tone: 'カジュアル', topics: ['日常', '食べ物'] },
];

// ---- generate ルートのコアロジック（src/app/api/generate/route.ts の再現）----

async function generateRouteLogic(personas, generateFn, insertFn) {
  if (!personas || personas.length === 0) {
    return { results: [], message: 'ペルソナが登録されていません', status: 200 };
  }

  const settled = await Promise.allSettled(
    personas.map(async (persona) => {
      const content = await generateFn(persona);
      const postId = await insertFn(persona.id, content);
      return { persona_id: persona.id, persona_name: persona.name, post_id: postId, content };
    })
  );

  const results = settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { persona_id: personas[i].id, persona_name: personas[i].name, error: r.reason?.message ?? String(r.reason) }
  );

  const hasError = settled.some((r) => r.status === 'rejected');
  return { results, status: hasError ? 207 : 200 };
}

// ---- テスト ----

describe('api/generate: ペルソナなしの場合', () => {
  test('空配列では空の results と 200 を返す', async () => {
    const res = await generateRouteLogic([], null, null);
    assert.deepEqual(res.results, []);
    assert.equal(res.status, 200);
    assert.ok(res.message);
  });

  test('null でも空の results と 200 を返す', async () => {
    const res = await generateRouteLogic(null, null, null);
    assert.deepEqual(res.results, []);
    assert.equal(res.status, 200);
  });
});

describe('api/generate: 全ペルソナ成功', () => {
  let counter = 0;
  const mockGenerate = async (persona) => `${persona.name}のツイート #${++counter}`;
  const mockInsert   = async (personaId, content) => `post-${personaId}-${Date.now()}`;

  test('results の件数がペルソナ数と一致する', async () => {
    counter = 0;
    const res = await generateRouteLogic(MOCK_PERSONAS, mockGenerate, mockInsert);
    assert.equal(res.results.length, MOCK_PERSONAS.length);
  });

  test('全成功なら HTTP 200', async () => {
    counter = 0;
    const res = await generateRouteLogic(MOCK_PERSONAS, mockGenerate, mockInsert);
    assert.equal(res.status, 200);
  });

  test('各 result に persona_id, persona_name, post_id, content が含まれる', async () => {
    counter = 0;
    const res = await generateRouteLogic(MOCK_PERSONAS, mockGenerate, mockInsert);
    for (const r of res.results) {
      assert.ok(r.persona_id,   'persona_id が必要');
      assert.ok(r.persona_name, 'persona_name が必要');
      assert.ok(r.post_id,      'post_id が必要');
      assert.ok(r.content,      'content が必要');
      assert.equal(r.error, undefined, 'error は含まれない');
    }
  });

  test('生成された content がペルソナに対応している', async () => {
    counter = 0;
    const res = await generateRouteLogic([MOCK_PERSONAS[0]], mockGenerate, mockInsert);
    assert.ok(res.results[0].content.includes('テック太郎'));
  });
});

describe('api/generate: 一部失敗', () => {
  test('1件失敗なら HTTP 207 を返す', async () => {
    let call = 0;
    const partialFail = async (persona) => {
      if (++call === 2) throw new Error('Gemini API タイムアウト');
      return `ツイート by ${persona.name}`;
    };
    const mockInsert = async () => 'post-id';
    const res = await generateRouteLogic(MOCK_PERSONAS, partialFail, mockInsert);
    assert.equal(res.status, 207);
  });

  test('失敗した result には error フィールドが含まれる', async () => {
    let call = 0;
    const partialFail = async () => {
      if (++call === 1) throw new Error('APIエラー発生');
      return 'ok tweet';
    };
    const mockInsert = async () => 'post-id';
    const res = await generateRouteLogic(MOCK_PERSONAS, partialFail, mockInsert);
    const failed = res.results.find((r) => r.error);
    assert.ok(failed, '失敗した result が存在する');
    assert.ok(failed.error.includes('APIエラー'));
  });

  test('成功した result には error フィールドがない', async () => {
    let call = 0;
    const partialFail = async () => {
      if (++call === 1) throw new Error('error');
      return 'ok tweet';
    };
    const mockInsert = async () => 'post-id';
    const res = await generateRouteLogic(MOCK_PERSONAS, partialFail, mockInsert);
    const succeeded = res.results.find((r) => !r.error);
    assert.ok(succeeded);
    assert.equal(succeeded.error, undefined);
  });
});

describe('api/generate: DB保存エラー', () => {
  test('insert 失敗も error として扱われる', async () => {
    const mockGenerate = async () => 'ツイート内容';
    const failInsert   = async () => { throw new Error('DB接続エラー'); };
    const res = await generateRouteLogic([MOCK_PERSONAS[0]], mockGenerate, failInsert);
    assert.equal(res.status, 207);
    assert.ok(res.results[0].error.includes('DB接続エラー'));
  });
});
