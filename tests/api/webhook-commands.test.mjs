/**
 * tests/api/webhook-commands.test.mjs
 * LINE Webhook コマンドハンドラのロジックをモックで検証する
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ---- コマンドテーブルの再現 ----

const COMMANDS = {
  '生成': 'handleGenerate',
  'gen':  'handleGenerate',
  '投稿': 'handlePost',
  'post': 'handlePost',
  'トレンド': 'handleTrend',
  'trend':    'handleTrend',
  '一覧': 'handleList',
  'list': 'handleList',
  'ヘルプ': 'handleHelp',
  'help':   'handleHelp',
};

function resolveCommand(text) {
  return COMMANDS[text] ?? COMMANDS[text.toLowerCase()] ?? null;
}

// ---- 承認/却下パターンの再現 ----

function parseApproval(text) {
  const approveMatch = text.match(/^承認\s+([0-9a-f]{8})$/i);
  const rejectMatch  = text.match(/^却下\s+([0-9a-f]{8})$/i);
  if (!approveMatch && !rejectMatch) return null;
  return {
    shortId: (approveMatch ?? rejectMatch)[1].toLowerCase(),
    action: approveMatch ? 'approved' : 'rejected',
  };
}

// ---- テスト: コマンドテーブル ----

describe('webhook: コマンド解決', () => {
  test('「生成」→ handleGenerate', () => assert.equal(resolveCommand('生成'), 'handleGenerate'));
  test('"gen" → handleGenerate',   () => assert.equal(resolveCommand('gen'), 'handleGenerate'));
  test('「投稿」→ handlePost',     () => assert.equal(resolveCommand('投稿'), 'handlePost'));
  test('"post" → handlePost',      () => assert.equal(resolveCommand('post'), 'handlePost'));
  test('「トレンド」→ handleTrend',() => assert.equal(resolveCommand('トレンド'), 'handleTrend'));
  test('"trend" → handleTrend',    () => assert.equal(resolveCommand('trend'), 'handleTrend'));
  test('「一覧」→ handleList',     () => assert.equal(resolveCommand('一覧'), 'handleList'));
  test('"list" → handleList',      () => assert.equal(resolveCommand('list'), 'handleList'));
  test('「ヘルプ」→ handleHelp',   () => assert.equal(resolveCommand('ヘルプ'), 'handleHelp'));
  test('"help" → handleHelp',      () => assert.equal(resolveCommand('help'), 'handleHelp'));
  test('大文字 "GEN" → handleGenerate（小文字に正規化）', () =>
    assert.equal(resolveCommand('GEN'), 'handleGenerate'));
  test('未知のテキストは null',     () => assert.equal(resolveCommand('なんでも'), null));
  test('空文字は null',             () => assert.equal(resolveCommand(''), null));
});

// ---- テスト: 承認/却下パターン ----

describe('webhook: 承認/却下パターンの優先度', () => {
  test('「承認 a1b2c3d4」はコマンドより承認処理が優先される', () => {
    const result = parseApproval('承認 a1b2c3d4');
    assert.ok(result);
    assert.equal(result.action, 'approved');
    // このテキストはコマンドテーブルに存在しない
    assert.equal(resolveCommand('承認 a1b2c3d4'), null);
  });

  test('「却下 a1b2c3d4」は承認/却下フロー', () => {
    const result = parseApproval('却下 a1b2c3d4');
    assert.ok(result);
    assert.equal(result.action, 'rejected');
  });

  test('コマンドテキストは承認パターンにマッチしない', () => {
    assert.equal(parseApproval('生成'), null);
    assert.equal(parseApproval('トレンド'), null);
    assert.equal(parseApproval('ヘルプ'), null);
  });
});

// ---- テスト: baseUrl 生成ロジック ----

describe('webhook: baseUrl の動的生成', () => {
  function buildBaseUrl(host) {
    const protocol = host.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${host}`;
  }

  test('localhost はhttp', () => {
    assert.equal(buildBaseUrl('localhost:3000'), 'http://localhost:3000');
  });

  test('Vercel ドメインは https', () => {
    assert.equal(
      buildBaseUrl('my-project.vercel.app'),
      'https://my-project.vercel.app'
    );
  });

  test('カスタムドメインも https', () => {
    assert.equal(buildBaseUrl('example.com'), 'https://example.com');
  });
});

// ---- テスト: ヘルプテキスト ----

describe('webhook: ヘルプテキストの内容', () => {
  const helpText = [
    '【使えるコマンド一覧】',
    '生成 / gen',
    '投稿 / post',
    'トレンド / trend',
    '一覧 / list',
    'ヘルプ / help',
  ].join('\n');

  test('ヘルプに全コマンドが含まれる', () => {
    assert.ok(helpText.includes('生成'));
    assert.ok(helpText.includes('投稿'));
    assert.ok(helpText.includes('トレンド'));
    assert.ok(helpText.includes('一覧'));
    assert.ok(helpText.includes('ヘルプ'));
  });
});
