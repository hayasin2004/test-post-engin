/**
 * tests/api/cron-scheduled-logic.test.mjs
 * /api/cron/post-scheduled のコアロジックをモックデータで検証する
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ---- スケジュール投稿ロジックの再現 ----

async function scheduledPostLogic(posts, postTweetFn, updateFn) {
  if (!posts || posts.length === 0) {
    return { results: [], message: '実行すべきスケジュール投稿がありません' };
  }

  const results = [];
  const now = new Date().toISOString();

  for (const post of posts) {
    // scheduled_at が NULL または未来の場合はスキップ
    if (!post.scheduled_at || post.scheduled_at > now) {
      results.push({ post_id: post.id, success: false, error: 'スキップ（未来または未設定）' });
      continue;
    }

    try {
      if (!post.creds) throw new Error('認証情報がありません');
      const tweetId = await postTweetFn(post.creds, post.content);
      await updateFn(post.id, tweetId);
      results.push({ post_id: post.id, success: true, tweet_id: tweetId });
    } catch (err) {
      results.push({ post_id: post.id, success: false, error: err.message });
    }
  }

  return { results };
}

// ---- モックデータ ----

const PAST_TIME   = '2020-01-01T00:00:00.000Z';
const FUTURE_TIME = '2099-01-01T00:00:00.000Z';

const mockPost = (overrides = {}) => ({
  id: 'post-1',
  content: 'テストツイート',
  creds: 'encrypted-creds',
  scheduled_at: PAST_TIME,
  ...overrides,
});

const mockPostTweet = async () => 'tweet-abc123';
const mockUpdate    = async () => {};

// ---- テスト ----

describe('cron/post-scheduled: 対象なし', () => {
  test('空配列なら message を返す', async () => {
    const res = await scheduledPostLogic([], mockPostTweet, mockUpdate);
    assert.ok(res.message);
    assert.deepEqual(res.results, []);
  });
});

describe('cron/post-scheduled: 投稿成功', () => {
  test('過去の scheduled_at を持つ投稿は成功する', async () => {
    const { results } = await scheduledPostLogic(
      [mockPost()], mockPostTweet, mockUpdate
    );
    assert.equal(results[0].success, true);
    assert.ok(results[0].tweet_id);
  });

  test('tweet_id がレスポンスに含まれる', async () => {
    const { results } = await scheduledPostLogic(
      [mockPost()], mockPostTweet, mockUpdate
    );
    assert.equal(results[0].tweet_id, 'tweet-abc123');
  });

  test('複数投稿が全件処理される', async () => {
    const posts = [
      mockPost({ id: 'p1' }),
      mockPost({ id: 'p2' }),
    ];
    const { results } = await scheduledPostLogic(posts, mockPostTweet, mockUpdate);
    assert.equal(results.filter((r) => r.success).length, 2);
  });
});

describe('cron/post-scheduled: エラーハンドリング', () => {
  test('X API エラーは失敗として記録される', async () => {
    const failTweet = async () => { throw new Error('X API 429 Rate Limit'); };
    const { results } = await scheduledPostLogic([mockPost()], failTweet, mockUpdate);
    assert.equal(results[0].success, false);
    assert.ok(results[0].error.includes('Rate Limit'));
  });

  test('DB 更新エラーも失敗扱いになる', async () => {
    const failUpdate = async () => { throw new Error('DB 接続エラー'); };
    const { results } = await scheduledPostLogic([mockPost()], mockPostTweet, failUpdate);
    assert.equal(results[0].success, false);
  });

  test('認証情報がない投稿はエラーになる', async () => {
    const { results } = await scheduledPostLogic(
      [mockPost({ creds: null })], mockPostTweet, mockUpdate
    );
    assert.equal(results[0].success, false);
    assert.ok(results[0].error.includes('認証情報'));
  });

  test('1件失敗しても他は続行される', async () => {
    let call = 0;
    const partialFail = async () => {
      if (++call === 1) throw new Error('エラー');
      return 'tweet-ok';
    };
    const posts = [mockPost({ id: 'p1' }), mockPost({ id: 'p2' })];
    const { results } = await scheduledPostLogic(posts, partialFail, mockUpdate);
    assert.equal(results[0].success, false);
    assert.equal(results[1].success, true);
  });
});
