/**
 * tests/api/post-logic.test.mjs
 * /api/post のモック X 投稿ロジックを検証する
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ---- モックデータ ----

const MOCK_APPROVED_POSTS = [
  {
    id: 'post-uuid-1',
    persona_id: 'p1',
    content: '承認済みツイート①',
    status: 'approved',
    posted_at: null,
    created_at: '2026-04-22T10:00:00Z',
    personas: { x_credentials_encrypted: 'enc-cred-p1' },
  },
  {
    id: 'post-uuid-2',
    persona_id: 'p2',
    content: '承認済みツイート②',
    status: 'approved',
    posted_at: null,
    created_at: '2026-04-22T11:00:00Z',
    personas: { x_credentials_encrypted: 'enc-cred-p2' },
  },
];

// ---- post ルートのコアロジック（src/app/api/post/route.ts の再現）----

async function postRouteLogic(posts, postTweetFn, updateFn) {
  if (!posts || posts.length === 0) {
    return { results: [], message: '承認済みの投稿がありません', status: 200 };
  }

  const settled = await Promise.allSettled(
    posts.map(async (post) => {
      const xCreds = post.personas?.x_credentials_encrypted;
      if (!xCreds) throw new Error(`ペルソナの X 認証情報が見つかりません (post_id: ${post.id})`);

      const tweetId = await postTweetFn(xCreds, post.content);
      await updateFn(post.id, { status: 'posted', posted_at: new Date().toISOString() });
      return { post_id: post.id, tweet_id: tweetId, content: post.content };
    })
  );

  const results = settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { post_id: posts[i].id, error: r.reason?.message ?? String(r.reason) }
  );

  const hasError = settled.some((r) => r.status === 'rejected');
  return { results, status: hasError ? 207 : 200 };
}

// ---- テスト ----

describe('api/post: 承認済み投稿なし', () => {
  test('空配列では空の results と 200 を返す', async () => {
    const res = await postRouteLogic([], null, null);
    assert.deepEqual(res.results, []);
    assert.equal(res.status, 200);
    assert.ok(res.message);
  });
});

describe('api/post: 全件投稿成功', () => {
  let tweetCounter = 0;
  const mockPostTweet  = async () => `tweet-id-${++tweetCounter}`;
  const mockUpdate     = async () => {};

  test('results の件数が投稿数と一致する', async () => {
    tweetCounter = 0;
    const res = await postRouteLogic(MOCK_APPROVED_POSTS, mockPostTweet, mockUpdate);
    assert.equal(res.results.length, 2);
  });

  test('全成功なら HTTP 200', async () => {
    tweetCounter = 0;
    const res = await postRouteLogic(MOCK_APPROVED_POSTS, mockPostTweet, mockUpdate);
    assert.equal(res.status, 200);
  });

  test('各 result に post_id, tweet_id, content が含まれる', async () => {
    tweetCounter = 0;
    const res = await postRouteLogic(MOCK_APPROVED_POSTS, mockPostTweet, mockUpdate);
    for (const r of res.results) {
      assert.ok(r.post_id,  'post_id が必要');
      assert.ok(r.tweet_id, 'tweet_id が必要');
      assert.ok(r.content,  'content が必要');
      assert.equal(r.error, undefined);
    }
  });

  test('DB update が正しい引数で呼ばれる', async () => {
    tweetCounter = 0;
    const updateCalls = [];
    const capturingUpdate = async (id, data) => updateCalls.push({ id, data });
    await postRouteLogic([MOCK_APPROVED_POSTS[0]], mockPostTweet, capturingUpdate);

    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].id, 'post-uuid-1');
    assert.equal(updateCalls[0].data.status, 'posted');
    assert.ok(updateCalls[0].data.posted_at, 'posted_at がセットされる');
    assert.ok(!isNaN(new Date(updateCalls[0].data.posted_at).getTime()), 'valid ISO 8601');
  });
});

describe('api/post: X API エラー', () => {
  test('1件失敗なら HTTP 207', async () => {
    let call = 0;
    const failPost = async () => {
      if (++call === 1) throw new Error('X API: rate limit exceeded');
      return 'tweet-ok';
    };
    const res = await postRouteLogic(MOCK_APPROVED_POSTS, failPost, async () => {});
    assert.equal(res.status, 207);
  });

  test('失敗 result に error が含まれる', async () => {
    const failPost = async () => { throw new Error('unauthorized'); };
    const res = await postRouteLogic([MOCK_APPROVED_POSTS[0]], failPost, async () => {});
    assert.ok(res.results[0].error.includes('unauthorized'));
  });
});

describe('api/post: X 認証情報なし', () => {
  test('personas が null の場合はエラー', async () => {
    const postWithoutCreds = [{ ...MOCK_APPROVED_POSTS[0], personas: null }];
    const res = await postRouteLogic(postWithoutCreds, async () => 'id', async () => {});
    assert.equal(res.status, 207);
    assert.ok(res.results[0].error.includes('X 認証情報'));
  });

  test('x_credentials_encrypted が undefined の場合はエラー', async () => {
    const postWithoutCreds = [{ ...MOCK_APPROVED_POSTS[0], personas: {} }];
    const res = await postRouteLogic(postWithoutCreds, async () => 'id', async () => {});
    assert.equal(res.status, 207);
    assert.ok(res.results[0].error);
  });
});
