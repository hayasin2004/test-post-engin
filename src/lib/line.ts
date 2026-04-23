import { messagingApi } from '@line/bot-sdk'
import { supabase } from './supabase'

const LINE_USER_ID            = process.env.LINE_USER_ID
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN

const SETTINGS_KEY_CURRENT_POST = 'current_reviewing_post_id'

// ---- カテゴリメタ情報（Flex Message の色分けに使用） ----

const TREND_META: Record<string, { label: string; headerColor: string }> = {
  tech:   { label: 'IT・技術ニュース',         headerColor: '#1d4ed8' },
  market: { label: '株価・経済動向',           headerColor: '#065f46' },
  sns:    { label: 'SNSトレンド（X・TikTok）', headerColor: '#7e22ce' },
  local:  { label: '名古屋・愛知ローカル情報',  headerColor: '#92400e' },
}

const CATEGORY_ORDER = ['tech', 'market', 'sns', 'local']

// ---- 内部ヘルパー ----

function getClient(): messagingApi.MessagingApiClient {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN が設定されていません')
  }
  return new messagingApi.MessagingApiClient({
    channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
  })
}

/** カテゴリ1件分の Flex Bubble を生成する */
function buildTrendBubble(
  category: string,
  content: string
): messagingApi.FlexBubble {
  const meta = TREND_META[category] ?? { label: category, headerColor: '#374151' }
  // 長すぎる本文は見やすさのため 400 文字に制限
  const body = content.length > 400 ? content.slice(0, 397) + '…' : content

  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: meta.headerColor,
      paddingAll: '12px',
      contents: [
        {
          type: 'text',
          text: meta.label,
          weight: 'bold',
          color: '#ffffff',
          size: 'sm',
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [
        {
          type: 'text',
          text: body,
          wrap: true,
          size: 'xs',
          color: '#444444',
          lineSpacing: '6px',
        },
      ],
    },
  } as messagingApi.FlexBubble
}

// ============================================================
// Public: Push 通知系
// ============================================================

export type TrendEntry = { topic_category: string; content: string }

/**
 * 本日のトレンドレポートを LINE に Flex Carousel で送信する。
 * cron/collect ジョブの完了後に呼び出される。
 *
 * @param trends daily_trends テーブルから取得したレコード
 * @param date   yyyy-mm-dd 形式の日付（JSTで計算済み）
 */
export async function sendTrendReport(trends: TrendEntry[], date: string): Promise<void> {
  if (!LINE_USER_ID) throw new Error('LINE_USER_ID が設定されていません')

  const client = getClient()
  const displayDate = date.replace(/-/g, '/')

  // 日付ヘッダーをテキストメッセージで先送り
  const headerMsg: messagingApi.TextMessage = {
    type: 'text',
    text: `${displayDate} の最新トレンドレポートをお届けします。`,
  }

  // カテゴリ順にソートして Flex Bubble を生成
  const sorted = CATEGORY_ORDER
    .map((key) => trends.find((t) => t.topic_category === key))
    .filter((t): t is TrendEntry => t !== undefined)

  if (sorted.length === 0) return

  const carouselMsg: messagingApi.FlexMessage = {
    type: 'flex',
    altText: `${displayDate} トレンドレポート（4カテゴリ）`,
    contents: {
      type: 'carousel',
      contents: sorted.map((t) => buildTrendBubble(t.topic_category, t.content)),
    } as messagingApi.FlexCarousel,
  }

  await client.pushMessage({
    to: LINE_USER_ID,
    messages: [headerMsg, carouselMsg],
  })
}

/**
 * 生成されたツイートを LINE に通知する。
 * Quick Reply ボタン（承認/却下）を付与し、タップするだけで操作できる。
 */
export async function sendTweetNotification(
  postId: string,
  personaName: string,
  content: string
): Promise<void> {
  if (!LINE_USER_ID) throw new Error('LINE_USER_ID が設定されていません')

  const shortId = postId.slice(0, 8)
  const client  = getClient()

  const message: messagingApi.TextMessage = {
    type: 'text',
    text: [
      `【${personaName}】`,
      content,
      '',
      `投稿ID: ${shortId}`,
    ].join('\n'),
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'message', label: '✅ 承認', text: `承認 ${shortId}` },
        },
        {
          type: 'action',
          action: { type: 'message', label: '❌ 却下', text: `却下 ${shortId}` },
        },
      ],
    } as messagingApi.QuickReply,
  }

  await client.pushMessage({
    to: LINE_USER_ID,
    messages: [message],
  })

  // settings テーブルにレビュー中の post_id を記録
  await supabase.from('settings').upsert(
    { key: SETTINGS_KEY_CURRENT_POST, value_encrypted: postId, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
}

// ============================================================
// Public: Reply 通知系（webhook コマンドハンドラから呼ばれる）
// ============================================================

/** テキストメッセージをリプライ送信する */
export async function replyText(replyToken: string, text: string): Promise<void> {
  const client = getClient()
  await client.replyMessage({
    replyToken,
    messages: [{ type: 'text', text }],
  })
}

/** 複数メッセージをリプライ送信する */
export async function replyMessages(
  replyToken: string,
  messages: messagingApi.Message[]
): Promise<void> {
  const client = getClient()
  await client.replyMessage({ replyToken, messages })
}

/**
 * 最新トレンドを取得して Flex Carousel でリプライする。
 * 「トレンド」コマンドから呼ばれる。
 */
export async function replyLatestTrends(replyToken: string): Promise<void> {
  // JST で今日の日付を計算
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const today  = jstNow.toISOString().slice(0, 10)

  const { data } = await supabase
    .from('daily_trends')
    .select('topic_category, content, date')
    .order('date', { ascending: false })
    .limit(8) // 最新日の4件 + 念のため前日分

  const rows = (data as TrendEntry[] | null) ?? []
  const todayRows = rows.filter((r) => (r as TrendEntry & { date: string }).date === today)

  if (todayRows.length === 0) {
    await replyText(replyToken, `本日（${today.replace(/-/g, '/')}）のトレンドはまだ収集されていません。\n毎朝 10:00 に自動収集されます。`)
    return
  }

  const displayDate = today.replace(/-/g, '/')
  const headerMsg: messagingApi.TextMessage = {
    type: 'text',
    text: `${displayDate} の最新トレンドレポートです。`,
  }

  const sorted = CATEGORY_ORDER
    .map((key) => todayRows.find((t) => t.topic_category === key))
    .filter((t): t is TrendEntry => t !== undefined)

  const carouselMsg: messagingApi.FlexMessage = {
    type: 'flex',
    altText: `${displayDate} トレンドレポート`,
    contents: {
      type: 'carousel',
      contents: sorted.map((t) => buildTrendBubble(t.topic_category, t.content)),
    } as messagingApi.FlexCarousel,
  }

  await replyMessages(replyToken, [headerMsg, carouselMsg])
}

// ============================================================
// Public: settings テーブル操作
// ============================================================

export async function getCurrentReviewingPostId(): Promise<string | null> {
  const { data } = await supabase
    .from('settings')
    .select('value_encrypted')
    .eq('key', SETTINGS_KEY_CURRENT_POST)
    .single()

  return (data as { value_encrypted: string } | null)?.value_encrypted ?? null
}

export async function clearCurrentReviewingPostId(): Promise<void> {
  await supabase.from('settings').delete().eq('key', SETTINGS_KEY_CURRENT_POST)
}
