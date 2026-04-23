import { NextResponse } from 'next/server'
import { supabase, Persona, Post } from '@/lib/supabase'
import { postTweet } from '@/lib/twitter'

export const dynamic = 'force-dynamic'

type ScheduledPost = Post & {
  personas: Pick<Persona, 'x_credentials_encrypted'>
}

/**
 * GET /api/cron/post-scheduled
 *
 * Vercel Cron（30分ごと）から呼び出される。
 * status = "approved" かつ scheduled_at <= NOW() の投稿を X API で投稿し
 * status = "posted" に更新する。
 *
 * scheduled_at が NULL の approved 投稿はスキップする（手動投稿フロー）。
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 })
    }
  }

  const now = new Date().toISOString()

  // scheduled_at が設定済みかつ現在時刻を過ぎた approved 投稿を取得
  const { data: posts, error: fetchError } = await supabase
    .from('posts')
    .select('*, personas(x_credentials_encrypted)')
    .eq('status', 'approved')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', now)

  if (fetchError) {
    return NextResponse.json(
      { error: 'スケジュール投稿の取得に失敗しました', detail: fetchError.message },
      { status: 500 }
    )
  }

  if (!posts || posts.length === 0) {
    return NextResponse.json({ results: [], message: '実行すべきスケジュール投稿がありません' })
  }

  const results: Array<{ post_id: string; success: boolean; tweet_id?: string; error?: string }> =
    []

  for (const post of posts as ScheduledPost[]) {
    try {
      const creds = post.personas?.x_credentials_encrypted
      if (!creds) {
        throw new Error(`ペルソナの X 認証情報が見つかりません (post_id: ${post.id})`)
      }

      const tweetId = await postTweet(creds, post.content)

      const { error: updateError } = await supabase
        .from('posts')
        .update({
          status: 'posted',
          tweet_id: tweetId,
          posted_at: new Date().toISOString(),
        })
        .eq('id', post.id)

      if (updateError) throw new Error(updateError.message)

      results.push({ post_id: post.id, success: true, tweet_id: tweetId })
    } catch (err) {
      results.push({
        post_id: post.id,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const hasError = results.some((r) => !r.success)
  return NextResponse.json({ results }, { status: hasError ? 207 : 200 })
}
