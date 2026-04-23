/**
 * tests/api/cron-collect-logic.test.mjs
 * /api/cron/collect のコアロジックをモックデータで検証する
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ---- カテゴリ定義（route.ts と同一構成） ----

const CATEGORIES = [
  { key: 'tech',   label: 'IT・技術ニュース' },
  { key: 'market', label: '株価・経済動向' },
  { key: 'sns',    label: 'SNSトレンド（X・TikTok）' },
  { key: 'local',  label: '名古屋・愛知ローカル情報' },
];

// ---- cron 収集ロジックの再現（外部依存をモック化） ----

async function collectTrendsLogic(categories, generateFn, insertFn) {
  const today = '2026-04-24'; // テスト用固定日付
  const sections = [];
  const results = [];

  for (const cat of categories) {
    try {
      const content = await generateFn(cat.key);
      await insertFn(today, cat.key, content);
      sections.push(`## ${cat.label}\n\n${content}`);
      results.push({ category: cat.key, success: true });
    } catch (err) {
      results.push({ category: cat.key, success: false, error: err.message });
    }
  }

  return { date: today, sections, results };
}

// ---- テスト ----

describe('cron/collect: 全カテゴリ成功', () => {
  const mockGenerate = async (key) => `${key} のトレンドサマリーです。`;
  const mockInsert   = async () => {};

  test('results の件数がカテゴリ数（4）と一致する', async () => {
    const { results } = await collectTrendsLogic(CATEGORIES, mockGenerate, mockInsert);
    assert.equal(results.length, 4);
  });

  test('全件 success: true になる', async () => {
    const { results } = await collectTrendsLogic(CATEGORIES, mockGenerate, mockInsert);
    assert.ok(results.every((r) => r.success === true));
  });

  test('sections の件数がカテゴリ数（4）と一致する', async () => {
    const { sections } = await collectTrendsLogic(CATEGORIES, mockGenerate, mockInsert);
    assert.equal(sections.length, 4);
  });

  test('sections に各カテゴリのラベルが含まれる', async () => {
    const { sections } = await collectTrendsLogic(CATEGORIES, mockGenerate, mockInsert);
    for (const cat of CATEGORIES) {
      assert.ok(
        sections.some((s) => s.includes(cat.label)),
        `"${cat.label}" が sections に含まれない`
      );
    }
  });

  test('date が yyyy-mm-dd 形式で返る', async () => {
    const { date } = await collectTrendsLogic(CATEGORIES, mockGenerate, mockInsert);
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('cron/collect: 一部カテゴリ失敗', () => {
  test('1件失敗しても他カテゴリは続行される', async () => {
    let call = 0;
    const partialFail = async (key) => {
      if (++call === 2) throw new Error('Gemini API エラー');
      return `${key} の内容`;
    };
    const mockInsert = async () => {};
    const { results } = await collectTrendsLogic(CATEGORIES, partialFail, mockInsert);
    assert.equal(results.length, 4);
    assert.equal(results.filter((r) => r.success).length, 3);
    assert.equal(results.filter((r) => !r.success).length, 1);
  });

  test('失敗した result には error フィールドが含まれる', async () => {
    const alwaysFail = async () => { throw new Error('接続タイムアウト'); };
    const mockInsert = async () => {};
    const { results } = await collectTrendsLogic([CATEGORIES[0]], alwaysFail, mockInsert);
    assert.equal(results[0].success, false);
    assert.ok(results[0].error.includes('接続タイムアウト'));
  });

  test('DB保存エラーも失敗扱いになる', async () => {
    const mockGenerate = async () => 'トレンド内容';
    const failInsert   = async () => { throw new Error('DB書き込みエラー'); };
    const { results } = await collectTrendsLogic([CATEGORIES[0]], mockGenerate, failInsert);
    assert.equal(results[0].success, false);
    assert.ok(results[0].error.includes('DB書き込みエラー'));
  });
});

describe('cron/collect: カテゴリ定義の整合性', () => {
  test('4カテゴリすべてのキーが定義されている', () => {
    const keys = CATEGORIES.map((c) => c.key);
    assert.ok(keys.includes('tech'),   'tech が存在しない');
    assert.ok(keys.includes('market'), 'market が存在しない');
    assert.ok(keys.includes('sns'),    'sns が存在しない');
    assert.ok(keys.includes('local'),  'local が存在しない');
  });

  test('全カテゴリにラベルが設定されている', () => {
    for (const cat of CATEGORIES) {
      assert.ok(cat.label, `${cat.key} のラベルが空`);
    }
  });
});

describe('cron/collect: Markdownレポート生成', () => {
  test('sections から有効な Markdown 文字列が組み立てられる', async () => {
    const mockGenerate = async (key) => `${key} の詳細情報`;
    const mockInsert   = async () => {};
    const { sections } = await collectTrendsLogic(CATEGORIES, mockGenerate, mockInsert);

    const md = sections.join('\n\n---\n\n');
    assert.ok(md.includes('##'), 'Markdown の見出しが含まれない');
    assert.ok(md.includes('---'), 'Markdown のセパレータが含まれない');
    assert.equal((md.match(/---/g) ?? []).length, CATEGORIES.length - 1, 'セパレータ数が不正');
  });
});
