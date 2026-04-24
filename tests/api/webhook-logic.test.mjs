/**
 * tests/api/webhook-logic.test.mjs
 * /api/line/webhook の署名検証・メッセージ解析・ステータス更新ロジックを検証する
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

// ---- 再現ロジック（src/app/api/line/webhook/route.ts から抽出）----

function validateSignature(body, channelSecret, signature) {
  const expected = createHmac('sha256', channelSecret).update(body).digest('base64');
  return expected === signature;
}

function parseLineMessage(text) {
  const trimmed = text.trim();
  const approveMatch = trimmed.match(/^承認\s+([0-9a-f]{8})$/i);
  const rejectMatch  = trimmed.match(/^却下\s+([0-9a-f]{8})$/i);
  if (approveMatch) return { action: 'approved', shortId: approveMatch[1].toLowerCase() };
  if (rejectMatch)  return { action: 'rejected',  shortId: rejectMatch[1].toLowerCase() };
  return null;
}

// Webhook ハンドラーのコアロジック
async function webhookHandlerLogic(body, signature, channelSecret, getFn, updateFn, clearFn) {
  // ① 署名検証
  if (!validateSignature(body, channelSecret, signature)) {
    return { error: '署名検証に失敗しました', httpStatus: 401 };
  }

  // ② JSON パース
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return { error: 'JSON のパースに失敗しました', httpStatus: 400 };
  }

  const processed = [];
  for (const event of payload.events ?? []) {
    if (event.type !== 'message') continue;
    if (event.message?.type !== 'text') continue;

    const parsed = parseLineMessage(event.message.text);
    if (!parsed) continue;

    const currentPostId = await getFn();
    if (!currentPostId) continue;

    if (!currentPostId.toLowerCase().startsWith(parsed.shortId)) continue;

    await updateFn(currentPostId, parsed.action);
    await clearFn();
    processed.push({ postId: currentPostId, action: parsed.action });
  }

  return { ok: true, processed, httpStatus: 200 };
}

// ---- ヘルパー ----

const SECRET = 'test-secret-1234';

function sign(body) {
  return createHmac('sha256', SECRET).update(body).digest('base64');
}

function makeBody(text) {
  return JSON.stringify({
    destination: 'Utest',
    events: [{
      type: 'message',
      message: { type: 'text', text },
    }],
  });
}

// ---- テスト ----

describe('webhook: validateSignature', () => {
  test('正しい署名は true', () => {
    const body = '{"test":"data"}';
    assert.equal(validateSignature(body, SECRET, sign(body)), true);
  });

  test('誤った署名は false', () => {
    assert.equal(validateSignature('{}', SECRET, 'invalidsig=='), false);
  });

  test('ボディが変わると署名不一致', () => {
    const body1 = '{"a":1}';
    const body2 = '{"a":2}';
    const sig1 = sign(body1);
    assert.equal(validateSignature(body2, SECRET, sig1), false);
  });

  test('シークレットが違うと不一致', () => {
    const body = '{}';
    const sig = sign(body);
    assert.equal(validateSignature(body, 'different-secret', sig), false);
  });
});

describe('webhook: parseLineMessage', () => {
  test('「承認 a1b2c3d4」→ approved', () => {
    const r = parseLineMessage('承認 a1b2c3d4');
    assert.deepEqual(r, { action: 'approved', shortId: 'a1b2c3d4' });
  });

  test('「却下 a1b2c3d4」→ rejected', () => {
    const r = parseLineMessage('却下 a1b2c3d4');
    assert.deepEqual(r, { action: 'rejected', shortId: 'a1b2c3d4' });
  });

  test('大文字HEXは小文字に正規化される', () => {
    const r = parseLineMessage('承認 A1B2C3D4');
    assert.equal(r?.shortId, 'a1b2c3d4');
  });

  test('前後に空白があってもパースできる', () => {
    const r = parseLineMessage('  承認 a1b2c3d4  ');
    assert.ok(r !== null);
    assert.equal(r.action, 'approved');
  });

  test('「承認」だけ（shortId なし）→ null', () => {
    assert.equal(parseLineMessage('承認'), null);
  });

  test('hex でない shortId → null', () => {
    assert.equal(parseLineMessage('承認 xxxxxxxx'), null);
  });

  test('7文字の shortId → null（8文字必要）', () => {
    assert.equal(parseLineMessage('承認 a1b2c3d'), null);
  });

  test('無関係なテキスト → null', () => {
    assert.equal(parseLineMessage('こんにちは'), null);
    assert.equal(parseLineMessage('ok'), null);
  });
});

describe('webhook: ハンドラーロジック', () => {
  const CURRENT_POST_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  test('正常な「承認」メッセージで approved に更新される', async () => {
    const updates = [];
    const body = makeBody('承認 a1b2c3d4');
    const res = await webhookHandlerLogic(
      body, sign(body), SECRET,
      async () => CURRENT_POST_ID,
      async (id, action) => updates.push({ id, action }),
      async () => {}
    );
    assert.equal(res.httpStatus, 200);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].action, 'approved');
    assert.equal(updates[0].id, CURRENT_POST_ID);
  });

  test('正常な「却下」メッセージで rejected に更新される', async () => {
    const updates = [];
    const body = makeBody('却下 a1b2c3d4');
    await webhookHandlerLogic(
      body, sign(body), SECRET,
      async () => CURRENT_POST_ID,
      async (id, action) => updates.push({ id, action }),
      async () => {}
    );
    assert.equal(updates[0].action, 'rejected');
  });

  test('署名が不正なら 401 を返す', async () => {
    const body = makeBody('承認 a1b2c3d4');
    const res = await webhookHandlerLogic(
      body, 'badsig==', SECRET,
      async () => CURRENT_POST_ID,
      async () => {},
      async () => {}
    );
    assert.equal(res.httpStatus, 401);
    assert.ok(res.error);
  });

  test('JSON が不正なら 400 を返す', async () => {
    const body = 'not-json';
    const res = await webhookHandlerLogic(
      body, sign(body), SECRET,
      async () => CURRENT_POST_ID,
      async () => {},
      async () => {}
    );
    assert.equal(res.httpStatus, 400);
  });

  test('レビュー中の post_id がない場合は更新しない', async () => {
    const updates = [];
    const body = makeBody('承認 a1b2c3d4');
    const res = await webhookHandlerLogic(
      body, sign(body), SECRET,
      async () => null,      // post_id なし
      async (id, a) => updates.push({ id, a }),
      async () => {}
    );
    assert.equal(updates.length, 0);
    assert.equal(res.httpStatus, 200);
  });

  test('shortId がレビュー中 post_id と一致しない場合は更新しない', async () => {
    const updates = [];
    const body = makeBody('承認 ffffffff');   // 違う shortId
    await webhookHandlerLogic(
      body, sign(body), SECRET,
      async () => CURRENT_POST_ID,           // 'a1b2c3d4...'
      async (id, a) => updates.push({ id, a }),
      async () => {}
    );
    assert.equal(updates.length, 0);
  });

  test('処理後に clearFn が呼ばれる', async () => {
    let cleared = false;
    const body = makeBody('承認 a1b2c3d4');
    await webhookHandlerLogic(
      body, sign(body), SECRET,
      async () => CURRENT_POST_ID,
      async () => {},
      async () => { cleared = true; }
    );
    assert.equal(cleared, true);
  });

  test('空の events 配列は 200 を返す（LINEの疎通確認）', async () => {
    const body = JSON.stringify({ destination: 'Utest', events: [] });
    const res = await webhookHandlerLogic(
      body, sign(body), SECRET,
      async () => null,
      async () => {},
      async () => {}
    );
    assert.equal(res.httpStatus, 200);
    assert.equal(res.processed.length, 0);
  });
});
