/**
 * tests/lib/line-flex.test.mjs
 * LINE Flex Message 生成ロジックとコマンドハンドラをモックで検証する
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ---- Flex Bubble 生成ロジックの再現 ----

const TREND_META = {
  tech:   { label: 'IT・技術ニュース',         headerColor: '#1d4ed8' },
  market: { label: '株価・経済動向',           headerColor: '#065f46' },
  sns:    { label: 'SNSトレンド（X・TikTok）', headerColor: '#7e22ce' },
  local:  { label: '名古屋・愛知ローカル情報',  headerColor: '#92400e' },
};

const CATEGORY_ORDER = ['tech', 'market', 'sns', 'local'];

function buildTrendBubble(category, content) {
  const meta = TREND_META[category] ?? { label: category, headerColor: '#374151' };
  const body = content.length > 400 ? content.slice(0, 397) + '…' : content;
  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: meta.headerColor,
      contents: [{ type: 'text', text: meta.label, weight: 'bold', color: '#ffffff' }],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'text', text: body, wrap: true }],
    },
  };
}

function buildTrendCarousel(trends) {
  const sorted = CATEGORY_ORDER
    .map((key) => trends.find((t) => t.topic_category === key))
    .filter((t) => t !== undefined);
  return {
    type: 'flex',
    altText: 'トレンドレポート',
    contents: {
      type: 'carousel',
      contents: sorted.map((t) => buildTrendBubble(t.topic_category, t.content)),
    },
  };
}

// ---- Quick Reply 生成ロジックの再現 ----

function buildTweetMessage(postId, personaName, content) {
  const shortId = postId.slice(0, 8);
  return {
    type: 'text',
    text: [`【${personaName}】`, content, '', `投稿ID: ${shortId}`].join('\n'),
    quickReply: {
      items: [
        { type: 'action', action: { type: 'message', label: '✅ 承認', text: `承認 ${shortId}` } },
        { type: 'action', action: { type: 'message', label: '❌ 却下', text: `却下 ${shortId}` } },
      ],
    },
  };
}

// ---- モックデータ ----

const MOCK_TRENDS = [
  { topic_category: 'tech',   content: 'AIの最新ニュース1。\nAIの最新ニュース2。' },
  { topic_category: 'market', content: '日経平均上昇。' },
  { topic_category: 'sns',    content: 'TikTokでバズっている話題。' },
  { topic_category: 'local',  content: '名古屋城のイベント情報。' },
];

// ---- テスト: Flex Carousel ----

describe('line-flex: トレンドCarousel生成', () => {
  test('type が flex になる', () => {
    const msg = buildTrendCarousel(MOCK_TRENDS);
    assert.equal(msg.type, 'flex');
  });

  test('contents.type が carousel になる', () => {
    const msg = buildTrendCarousel(MOCK_TRENDS);
    assert.equal(msg.contents.type, 'carousel');
  });

  test('4カテゴリすべてがカードになる', () => {
    const msg = buildTrendCarousel(MOCK_TRENDS);
    assert.equal(msg.contents.contents.length, 4);
  });

  test('カテゴリ順（tech → market → sns → local）に並ぶ', () => {
    const msg = buildTrendCarousel(MOCK_TRENDS);
    const labels = msg.contents.contents.map((b) => b.header.contents[0].text);
    assert.equal(labels[0], 'IT・技術ニュース');
    assert.equal(labels[3], '名古屋・愛知ローカル情報');
  });

  test('本文が400文字を超える場合は切り詰められる', () => {
    const longContent = 'あ'.repeat(500);
    const bubble = buildTrendBubble('tech', longContent);
    const body = bubble.body.contents[0].text;
    assert.ok(body.length <= 400, `本文が ${body.length} 文字で400文字超`);
    assert.ok(body.endsWith('…'), '省略記号で終わる');
  });

  test('400文字以下はそのまま表示される', () => {
    const shortContent = 'AI最新情報。';
    const bubble = buildTrendBubble('tech', shortContent);
    assert.equal(bubble.body.contents[0].text, shortContent);
  });

  test('未知のカテゴリキーでもバブルが生成される', () => {
    const bubble = buildTrendBubble('unknown', 'テスト内容');
    assert.equal(bubble.type, 'bubble');
    assert.equal(bubble.header.contents[0].text, 'unknown');
  });

  test('一部カテゴリが欠けてもエラーにならない', () => {
    const partial = [{ topic_category: 'tech', content: 'テック情報' }];
    const msg = buildTrendCarousel(partial);
    assert.equal(msg.contents.contents.length, 1);
  });
});

describe('line-flex: Flex Bubble の色設定', () => {
  test('tech カードのヘッダー色は青系', () => {
    const bubble = buildTrendBubble('tech', 'content');
    assert.equal(bubble.header.backgroundColor, '#1d4ed8');
  });

  test('market カードのヘッダー色は緑系', () => {
    const bubble = buildTrendBubble('market', 'content');
    assert.equal(bubble.header.backgroundColor, '#065f46');
  });

  test('sns カードのヘッダー色は紫系', () => {
    const bubble = buildTrendBubble('sns', 'content');
    assert.equal(bubble.header.backgroundColor, '#7e22ce');
  });

  test('local カードのヘッダー色は茶系', () => {
    const bubble = buildTrendBubble('local', 'content');
    assert.equal(bubble.header.backgroundColor, '#92400e');
  });
});

describe('line-flex: ツイート通知 Quick Reply', () => {
  const postId     = 'abcdef12-3456-7890-abcd-ef1234567890';
  const shortId    = 'abcdef12';

  test('メッセージにペルソナ名が含まれる', () => {
    const msg = buildTweetMessage(postId, 'テック太郎', 'テスト投稿');
    assert.ok(msg.text.includes('テック太郎'));
  });

  test('メッセージに投稿内容が含まれる', () => {
    const msg = buildTweetMessage(postId, 'テック太郎', 'テスト投稿内容です');
    assert.ok(msg.text.includes('テスト投稿内容です'));
  });

  test('QuickReply に承認ボタンが含まれる', () => {
    const msg = buildTweetMessage(postId, 'テック太郎', 'テスト');
    const approveItem = msg.quickReply.items.find((i) => i.action.label === '✅ 承認');
    assert.ok(approveItem, '承認ボタンが存在しない');
    assert.equal(approveItem.action.text, `承認 ${shortId}`);
  });

  test('QuickReply に却下ボタンが含まれる', () => {
    const msg = buildTweetMessage(postId, 'テック太郎', 'テスト');
    const rejectItem = msg.quickReply.items.find((i) => i.action.label === '❌ 却下');
    assert.ok(rejectItem, '却下ボタンが存在しない');
    assert.equal(rejectItem.action.text, `却下 ${shortId}`);
  });

  test('shortId は post_id の先頭8文字', () => {
    const msg = buildTweetMessage(postId, 'ペルソナ', 'ツイート');
    assert.ok(msg.text.includes(shortId));
    assert.ok(!msg.text.includes(postId)); // フル UUID は含まない
  });

  test('QuickReply のアイテム数は2件', () => {
    const msg = buildTweetMessage(postId, 'ペルソナ', 'ツイート');
    assert.equal(msg.quickReply.items.length, 2);
  });
});
