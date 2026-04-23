import { NextResponse } from 'next/server'
import { supabase, Persona, Post } from '@/lib/supabase'
import { getTweetMetrics } from '@/lib/twitter'

export const dynamic = 'force-dynamic'

type PostedPost = Post & {
  personas: Pick<Persona, 'x_credentials_encrypted'>
}

/**
 * GET /api/cron/metrics
 *
 * Vercel Cron（毎朝 12:00 JST = UTC 03:00）から呼び出される。
 * status = "posted" かつ tweet_id がある投稿のエンゲージメントを
 * X API v2 public_metrics で取得し post_metrics テーブルに保存する。
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 })
    }
  }

  // posted かつ tweet_id がある投稿をペルソナ認証情報ごと取得（直近30件）
  const { data: posts, error: fetchError } = await supabase
    .from('posts')
    .select('*, personas(x_credentials_encrypted)')
    .eq('status', 'posted')
    .not('tweet_id', 'is', null)
    .order('posted_at', { ascending: false })
    .limit(30)

  if (fetchError) {
    return NextResponse.json(
      { error: 'posted 投稿の取得に失敗しました', detail: fetchError.message },
      { status: 500 }
    )
  }

  if (!posts || posts.length === 0) {
    return NextResponse.json({ results: [], message: '計測対象の投稿がありません' })
  }

  const results: Array<{ post_id: string; success: boolean; error?: string }> = []

  for (const post of posts as PostedPost[]) {
    try {
      const creds = post.personas?.x_credentials_encrypted
      if (!creds || !post.tweet_id) {
        throw new Error('認証情報またはツイートIDが不足しています')
      }

      const metrics = await getTweetMetrics(creds, post.tweet_id)

      const { error: insertError } = await supabase.from('post_metrics').insert({
        post_id: post.id,
        tweet_id: post.tweet_id,
        likes: metrics.likes,
        retweets: metrics.retweets,
        impressions: metrics.impressions,
      })

      if (insertError) throw new Error(insertError.message)

      results.push({ post_id: post.id, success: true })
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
