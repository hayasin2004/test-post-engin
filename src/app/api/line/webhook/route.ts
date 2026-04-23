import { NextRequest, NextResponse } from 'next/server'
import { validateSignature, webhook } from '@line/bot-sdk'
import { supabase } from '@/lib/supabase'
import {
  getCurrentReviewingPostId,
  clearCurrentReviewingPostId,
  replyText,
  replyLatestTrends,
} from '@/lib/line'

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET

// ============================================================
// コマンドハンドラ
// ============================================================

/** 「ヘルプ」コマンド */
async function handleHelp(replyToken: string): Promise<void> {
  await replyText(
    replyToken,
    [
      '【使えるコマンド一覧】',
      '',
      '生成 / gen',
      '  → ツイートを生成して通知',
      '',
      '投稿 / post',
      '  → 承認済みツイートを X に投稿',
      '',
      'トレンド / trend',
      '  → 本日のトレンドレポートを表示',
      '',
      '一覧 / list',
      '  → 最新の生成済みツイート5件を表示',
      '',
      'ヘルプ / help',
      '  → このメニューを表示',
    ].join('\n')
  )
}

/** 「トレンド」コマンド */
async function handleTrend(replyToken: string): Promise<void> {
  await replyLatestTrends(replyToken)
}

/** 「一覧」コマンド — 生成済みツイートの最新5件を表示 */
async function handleList(replyToken: string): Promise<void> {
  const { data: posts } = await supabase
    .from('posts')
    .select('content, status, created_at, personas(name)')
    .eq('status', 'generated')
    .order('created_at', { ascending: false })
    .limit(5)

  if (!posts || posts.length === 0) {
    await replyText(replyToken, '現在、承認待ちの生成済みツイートはありません。')
    return
  }

  type PostRow = { content: string; created_at: string; personas: unknown }
  const lines: string[] = ['【生成済みツイート（最新5件）】']

  for (const [i, p] of (posts as PostRow[]).entries()) {
    const persona = p.personas as { name: string } | null
    const name = persona?.name ?? '—'
    lines.push(`\n[${i + 1}] ${name}\n${p.content}`)
  }

  await replyText(replyToken, lines.join('\n'))
}

/**
 * 「生成」コマンド — /api/generate を内部で呼び出してツイートを生成する
 * Gemini API の呼び出しを含むため、同一リクエスト内で処理する。
 */
async function handleGenerate(replyToken: string, baseUrl: string): Promise<void> {
  await replyText(replyToken, 'ツイート生成を開始します。完了したら別途通知します。')

  // LINE の replyToken 消費後に非同期で生成を実行（fire-and-forget）
  // Vercel では応答返却後に実行が打ち切られるため、fetch で内部 API を呼び出す
  fetch(`${baseUrl}/api/generate`, { method: 'POST' }).catch((e) =>
    console.error('[LINE cmd:生成] /api/generate の呼び出し失敗:', e)
  )
}

/**
 * 「投稿」コマンド — /api/post を内部で呼び出して承認済みツイートを X に投稿する
 */
async function handlePost(replyToken: string, baseUrl: string): Promise<void> {
  // approved の件数を先に確認
  const { count } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')

  if (!count || count === 0) {
    await replyText(replyToken, '現在、承認済みの投稿がありません。\nまず「承認 xxxxxxxx」で投稿を承認してください。')
    return
  }

  await replyText(replyToken, `承認済み ${count} 件を X に投稿します...`)

  fetch(`${baseUrl}/api/post`, { method: 'POST' }).catch((e) =>
    console.error('[LINE cmd:投稿] /api/post の呼び出し失敗:', e)
  )
}

// ============================================================
// コマンドテーブル
// ============================================================

const COMMANDS: Record<string, (token: string, baseUrl: string) => Promise<void>> = {
  '生成': handleGenerate,
  'gen':  handleGenerate,
  '投稿': handlePost,
  'post': handlePost,
  'トレンド': (t) => handleTrend(t),
  'trend':    (t) => handleTrend(t),
  '一覧': (t) => handleList(t),
  'list': (t) => handleList(t),
  'ヘルプ': (t) => handleHelp(t),
  'help':   (t) => handleHelp(t),
}

// ============================================================
// Webhook エントリーポイント
// ============================================================

/**
 * POST /api/line/webhook
 *
 * LINE Messaging API からの Webhook を受信する。
 *
 * ① 署名検証
 * ② テキストメッセージを解析
 *    a. 「承認 xxxxxxxx」/ 「却下 xxxxxxxx」→ ステータス更新
 *    b. コマンド（生成/投稿/トレンド/一覧/ヘルプ）→ 対応処理
 */
export async function POST(request: NextRequest) {
  if (!LINE_CHANNEL_SECRET) {
    return NextResponse.json(
      { error: 'LINE_CHANNEL_SECRET が設定されていません' },
      { status: 500 }
    )
  }

  const rawBody  = await request.text()
  const signature = request.headers.get('x-line-signature') ?? ''

  if (!validateSignature(rawBody, LINE_CHANNEL_SECRET, signature)) {
    return NextResponse.json({ error: '署名検証に失敗しました' }, { status: 401 })
  }

  let body: webhook.CallbackRequest
  try {
    body = JSON.parse(rawBody) as webhook.CallbackRequest
  } catch {
    return NextResponse.json({ error: 'JSON のパースに失敗しました' }, { status: 400 })
  }

  if (!body.events || body.events.length === 0) {
    return NextResponse.json({ ok: true })
  }

  // 内部 API 呼び出し用のベース URL を Request ヘッダーから動的に取得
  const host     = request.headers.get('host') ?? 'localhost:3000'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const baseUrl  = `${protocol}://${host}`

  for (const event of body.events) {
    if (event.type !== 'message') continue
    const messageEvent = event as webhook.MessageEvent
    if (messageEvent.message.type !== 'text') continue

    const replyToken = messageEvent.replyToken ?? ''
    const text       = (messageEvent.message as webhook.TextMessageContent).text.trim()

    // ── a. 承認 / 却下 パターン ───────────────────────────────
    const approveMatch = text.match(/^承認\s+([0-9a-f]{8})$/i)
    const rejectMatch  = text.match(/^却下\s+([0-9a-f]{8})$/i)

    if (approveMatch || rejectMatch) {
      const shortId   = (approveMatch ?? rejectMatch)![1].toLowerCase()
      const newStatus = approveMatch ? 'approved' : 'rejected'

      const currentPostId = await getCurrentReviewingPostId()
      if (!currentPostId) {
        console.warn('[LINE Webhook] レビュー中の投稿が見つかりません')
        continue
      }

      if (!currentPostId.toLowerCase().startsWith(shortId)) {
        console.warn(
          `[LINE Webhook] 短縮ID不一致: received=${shortId}, current=${currentPostId.slice(0, 8)}`
        )
        continue
      }

      const { error } = await supabase
        .from('posts')
        .update({ status: newStatus })
        .eq('id', currentPostId)
        .in('status', ['generated'])

      if (error) {
        console.error('[LINE Webhook] posts 更新エラー:', error.message)
        continue
      }

      console.info(`[LINE Webhook] 投稿 ${currentPostId} を ${newStatus} に更新しました`)
      await clearCurrentReviewingPostId()

      if (replyToken) {
        const label = newStatus === 'approved' ? '承認' : '却下'
        await replyText(replyToken, `✅ 投稿を${label}しました。`)
      }
      continue
    }

    // ── b. コマンドパターン ───────────────────────────────────
    const normalizedText = text.toLowerCase()
    const handler = COMMANDS[text] ?? COMMANDS[normalizedText]

    if (handler) {
      try {
        await handler(replyToken, baseUrl)
      } catch (err) {
        console.error(`[LINE Webhook] コマンド「${text}」の処理に失敗:`, err)
        if (replyToken) {
          await replyText(replyToken, `エラーが発生しました: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
