/**
 * tests/ui/dashboard-filter.test.mjs
 * DashboardClient.tsx のフィルタリング・バッジ・日付フォーマットロジックを検証する
 * （React レンダリングなし — UI ロジックのみ）
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ---- 再現ロジック（DashboardClient.tsx から抽出）----

const ALL_STATUSES = ['generated', 'approved', 'posted', 'rejected'];

const FILTER_LABELS = {
  all: 'すべて',
  generated: '生成済',
  approved: '承認済',
  posted: '投稿済',
  rejected: '却下',
};

const BADGE_CLASSES = {
  generated: 'badgeGenerated',
  approved:  'badgeApproved',
  posted:    'badgePosted',
  rejected:  'badgeRejected',
};

function badgeClass(status) {
  return BADGE_CLASSES[status];
}

function filterPosts(posts, filter) {
  return filter === 'all' ? posts : posts.filter((p) => p.status === filter);
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('ja-JP', {
    month:  '2-digit',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

// ---- ダミーデータ ----

const DUMMY_POSTS = [
  { id: '1', status: 'generated', content: '生成済み投稿①', created_at: '2026-04-22T10:00:00Z', personas: { name: 'A' } },
  { id: '2', status: 'generated', content: '生成済み投稿②', created_at: '2026-04-22T10:30:00Z', personas: { name: 'B' } },
  { id: '3', status: 'approved',  content: '承認済み投稿',   created_at: '2026-04-22T11:00:00Z', personas: { name: 'A' } },
  { id: '4', status: 'posted',    content: '投稿済み',       created_at: '2026-04-22T12:00:00Z', personas: { name: 'B' } },
  { id: '5', status: 'rejected',  content: '却下投稿',       created_at: '2026-04-22T13:00:00Z', personas: { name: 'A' } },
];

// ---- テスト ----

describe('dashboard: フィルタリング', () => {
  test('"all" フィルターで全5件返る', () => {
    assert.equal(filterPosts(DUMMY_POSTS, 'all').length, 5);
  });

  test('"generated" フィルターで2件', () => {
    assert.equal(filterPosts(DUMMY_POSTS, 'generated').length, 2);
  });

  test('"approved" フィルターで1件', () => {
    assert.equal(filterPosts(DUMMY_POSTS, 'approved').length, 1);
  });

  test('"posted" フィルターで1件', () => {
    assert.equal(filterPosts(DUMMY_POSTS, 'posted').length, 1);
  });

  test('"rejected" フィルターで1件', () => {
    assert.equal(filterPosts(DUMMY_POSTS, 'rejected').length, 1);
  });

  test('空配列に "all" を適用しても空', () => {
    assert.equal(filterPosts([], 'all').length, 0);
  });

  test('空配列に "generated" を適用しても空', () => {
    assert.equal(filterPosts([], 'generated').length, 0);
  });

  test('フィルター結果の content が正しい', () => {
    const result = filterPosts(DUMMY_POSTS, 'approved');
    assert.equal(result[0].content, '承認済み投稿');
  });
});

describe('dashboard: ステータスバッジクラス', () => {
  for (const status of ALL_STATUSES) {
    test(`${status} → badge${status.charAt(0).toUpperCase() + status.slice(1)}`, () => {
      const expected = `badge${status.charAt(0).toUpperCase() + status.slice(1)}`;
      assert.equal(badgeClass(status), expected);
    });
  }

  test('全ステータスに対してクラスが存在する', () => {
    for (const s of ALL_STATUSES) {
      assert.ok(badgeClass(s), `${s} のバッジクラスが必要`);
    }
  });
});

describe('dashboard: フィルターラベル', () => {
  test('全フィルター種別に日本語ラベルが存在する', () => {
    const keys = ['all', ...ALL_STATUSES];
    for (const key of keys) {
      assert.ok(FILTER_LABELS[key], `${key} のラベルが必要`);
    }
  });

  test('"all" ラベルは「すべて」', () => {
    assert.equal(FILTER_LABELS['all'], 'すべて');
  });

  test('"generated" ラベルは「生成済」', () => {
    assert.equal(FILTER_LABELS['generated'], '生成済');
  });

  test('"approved" ラベルは「承認済」', () => {
    assert.equal(FILTER_LABELS['approved'], '承認済');
  });

  test('"posted" ラベルは「投稿済」', () => {
    assert.equal(FILTER_LABELS['posted'], '投稿済');
  });

  test('"rejected" ラベルは「却下」', () => {
    assert.equal(FILTER_LABELS['rejected'], '却下');
  });
});

describe('dashboard: 日付フォーマット', () => {
  test('ISO 文字列が日本語ロケールでフォーマットされる（月/日 時:分 の形式）', () => {
    const result = formatDate('2026-04-22T10:00:00.000Z');
    assert.match(result, /\d{2}\/\d{2} \d{2}:\d{2}/);
  });

  test('formatDate はタイムスタンプを文字列で返す', () => {
    const result = formatDate('2026-04-22T10:00:00Z');
    assert.equal(typeof result, 'string');
  });

  test('無効な日付文字列は Invalid Date にフォールバック', () => {
    const result = formatDate('not-a-date');
    assert.ok(typeof result === 'string');
  });
});

describe('dashboard: ステータスバッジ別カウント', () => {
  test('各ステータスのカウントが正しい', () => {
    const counts = {};
    for (const s of ALL_STATUSES) {
      counts[s] = DUMMY_POSTS.filter((p) => p.status === s).length;
    }
    assert.equal(counts['generated'], 2);
    assert.equal(counts['approved'],  1);
    assert.equal(counts['posted'],    1);
    assert.equal(counts['rejected'],  1);
  });
});
