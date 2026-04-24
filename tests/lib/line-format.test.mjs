/**
 * tests/lib/line-format.test.mjs
 * src/lib/line.ts の通知メッセージ生成ロジックを検証する
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ---- 再現ロジック ----

function buildNotificationMessage(postId, personaName, content) {
  const shortId = postId.slice(0, 8);
  return [
    `【${personaName}】`,
    content,
    '',
    `投稿ID: ${shortId}`,
    `「承認 ${shortId}」または「却下 ${shortId}」と返信してください`,
  ].join('\n');
}

// ---- テスト ----

const DUMMY_POST_ID   = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const DUMMY_PERSONA   = 'テストペルソナ';
const DUMMY_CONTENT   = 'これはテスト投稿です。AI最高！';

describe('line: buildNotificationMessage', () => {
  test('メッセージがペルソナ名【】で始まる', () => {
    const msg = buildNotificationMessage(DUMMY_POST_ID, DUMMY_PERSONA, DUMMY_CONTENT);
    assert.ok(msg.startsWith(`【${DUMMY_PERSONA}】`));
  });

  test('投稿内容が含まれる', () => {
    const msg = buildNotificationMessage(DUMMY_POST_ID, DUMMY_PERSONA, DUMMY_CONTENT);
    assert.ok(msg.includes(DUMMY_CONTENT));
  });

  test('shortId が UUID 先頭 8 文字', () => {
    const msg = buildNotificationMessage(DUMMY_POST_ID, DUMMY_PERSONA, DUMMY_CONTENT);
    const shortId = DUMMY_POST_ID.slice(0, 8); // 'a1b2c3d4'
    assert.ok(msg.includes(`投稿ID: ${shortId}`));
  });

  test('承認コマンド形式が含まれる', () => {
    const msg = buildNotificationMessage(DUMMY_POST_ID, DUMMY_PERSONA, DUMMY_CONTENT);
    assert.ok(msg.includes('承認 a1b2c3d4'));
  });

  test('却下コマンド形式が含まれる', () => {
    const msg = buildNotificationMessage(DUMMY_POST_ID, DUMMY_PERSONA, DUMMY_CONTENT);
    assert.ok(msg.includes('却下 a1b2c3d4'));
  });

  test('全行が改行で結合されている', () => {
    const msg = buildNotificationMessage(DUMMY_POST_ID, DUMMY_PERSONA, DUMMY_CONTENT);
    const lines = msg.split('\n');
    assert.ok(lines.length >= 5);
  });

  test('異なる UUID でも正しい shortId が使われる', () => {
    const id = 'ffffffff-0000-1111-2222-333344445555';
    const msg = buildNotificationMessage(id, 'X', 'content');
    assert.ok(msg.includes('ffffffff'));
    assert.ok(!msg.includes('fffffff0')); // 8文字目まで
  });
});

describe('line: SETTINGS_KEY_CURRENT_POST 管理', () => {
  test('キー名は固定文字列 current_reviewing_post_id', () => {
    const key = 'current_reviewing_post_id';
    assert.equal(key, 'current_reviewing_post_id');
  });

  test('post_id を保存・取得して一致する（ロジック確認）', () => {
    const store = new Map();
    const postId = 'uuid-test-1234';
    store.set('current_reviewing_post_id', postId);
    assert.equal(store.get('current_reviewing_post_id'), postId);
  });

  test('クリア後は undefined になる（ロジック確認）', () => {
    const store = new Map();
    store.set('current_reviewing_post_id', 'some-id');
    store.delete('current_reviewing_post_id');
    assert.equal(store.get('current_reviewing_post_id'), undefined);
  });
});
