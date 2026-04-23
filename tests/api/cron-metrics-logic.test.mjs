/**
 * tests/api/cron-metrics-logic.test.mjs
 * /api/cron/metrics のコアロジックをモックデータで検証する
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ---- メトリクス収集ロジックの再現 ----

async function collectMetricsLogic(posts, getMetricsFn, insertFn) {
  if (!posts || posts.length === 0) {
    return { results: [], message: '計測対象の投稿がありません' };
  }

  const results = [];

  for (const post of posts) {
    try {
      if (!post.tweet_id) throw new Error('tweet_id がありません');
      if (!post.creds) throw new Error('認証情報がありません');

      const metrics = await getMetricsFn(post.creds, post.tweet_id);
      await insertFn(post.id, post.tweet_id, metrics);
      results.push({ post_id: post.id, success: true });
    } catch (err) {
      results.push({ post_id: post.id, success: false, error: err.message });
    }
  }

  return { results };
}

// ---- モックデータ ----

const MOCK_POSTS = [
  { id: 'post-1', tweet_id: 'tweet-1', creds: 'creds-1' },
  { id: 'post-2', tweet_id: 'tweet-2', creds: 'creds-2' },
];

const mockGetMetrics = async () => ({ likes: 10, retweets: 3, impressions: 500 });
const mockInsert    = async () => {};

// ---- テスト ----

describe('cron/metrics: 全件成功', () => {
  test('results の件数が投稿数と一致する', async () => {
    const { results } = await collectMetricsLogic(MOCK_POSTS, mockGetMetrics, mockInsert);
    assert.equal(results.length, 2);
  });

  test('全件 success: true', async () => {
    const { results } = await collectMetricsLogic(MOCK_POSTS, mockGetMetrics, mockInsert);
    assert.ok(results.every((r) => r.success === true));
  });
});

describe('cron/metrics: 対象なし', () => {
  test('空配列なら message が返る', async () => {
    const res = await collectMetricsLogic([], mockGetMetrics, mockInsert);
    assert.ok(res.message);
    assert.deepEqual(res.results, []);
  });

  test('null でも空の results が返る', async () => {
    const res = await collectMetricsLogic(null, mockGetMetrics, mockInsert);
    assert.ok(res.message);
  });
});

describe('cron/metrics: エラーハンドリング', () => {
  test('tweet_id がない投稿はエラーになる', async () => {
    const posts = [{ id: 'p1', tweet_id: null, creds: 'c' }];
    const { results } = await collectMetricsLogic(posts, mockGetMetrics, mockInsert);
    assert.equal(results[0].success, false);
    assert.ok(results[0].error.includes('tweet_id'));
  });

  test('認証情報がない投稿はエラーになる', async () => {
    const posts = [{ id: 'p1', tweet_id: 'tid', creds: null }];
    const { results } = await collectMetricsLogic(posts, mockGetMetrics, mockInsert);
    assert.equal(results[0].success, false);
  });

  test('X API エラーでも他の投稿は続行される', async () => {
    let call = 0;
    const partialFail = async () => {
      if (++call === 1) throw new Error('API rate limit');
      return { likes: 5, retweets: 1, impressions: 100 };
    };
    const { results } = await collectMetricsLogic(MOCK_POSTS, partialFail, mockInsert);
    assert.equal(results.length, 2);
    assert.equal(results[0].success, false);
    assert.equal(results[1].success, true);
  });

  test('DB 保存エラーも失敗扱いになる', async () => {
    const failInsert = async () => { throw new Error('DB error'); };
    const { results } = await collectMetricsLogic(
      [MOCK_POSTS[0]], mockGetMetrics, failInsert
    );
    assert.equal(results[0].success, false);
    assert.ok(results[0].error.includes('DB error'));
  });
});
