import { NextResponse } from 'next/server'
import { supabase, Persona, Post } from '@/lib/supabase'
import { postTweet } from '@/lib/twitter'

type ApprovedPost = Post & {
  personas: Pick<Persona, 'x_credentials_encrypted'>
}

/**
 * POST /api/post
 *
 * status = "approved" の投稿をすべて取得し、X API で投稿する。
 * 投稿成功後に status = "posted", posted_at = 現在時刻 に更新する。
 *
 * > 停止ポイント: 実際の X 投稿は本番 API 呼び出しのため、人間の確認後に実施
 *
 * レスポンス例:
 * {
 *   "results": [
 *     { "post_id": "...", "tweet_id": "...", "content": "..." },
 *     { "post_id": "...", "error": "..." }
 *   ]
 * }
 */
export async function POST() {
  // approved な投稿をペルソナの認証情報ごと取得
  const { data: posts, error: fetchError } = await supabase
    .from('posts')
    .select('*, personas(x_credentials_encrypted)')
    .eq('status', 'approved')

  if (fetchError) {
    return NextResponse.json(
      { error: '投稿の取得に失敗しました', detail: fetchError.message },
      { status: 500 }
    )
  }

  if (!posts || posts.length === 0) {
    return NextResponse.json({ results: [], message: '承認済みの投稿がありません' })
  }

  const results = await Promise.allSettled(
    (posts as ApprovedPost[]).map(async (post) => {
      const xCredentialsEncrypted = post.personas?.x_credentials_encrypted
      if (!xCredentialsEncrypted) {
        throw new Error(`ペルソナの X 認証情報が見つかりません (post_id: ${post.id})`)
      }

      // X API でツイート投稿（crypto.ts 経由で復号）
      const tweetId = await postTweet(xCredentialsEncrypted, post.content)

      // status を posted に更新、X のツイートIDも保存
      const { error: updateError } = await supabase
        .from('posts')
        .update({
          status: 'posted',
          tweet_id: tweetId,
          posted_at: new Date().toISOString(),
        })
        .eq('id', post.id)

      if (updateError) {
        throw new Error(
          `投稿ステータスの更新に失敗しました (post_id: ${post.id}): ${updateError.message}`
        )
      }

      return {
        post_id: post.id,
        tweet_id: tweetId,
        content: post.content,
      }
    })
  )

  const response = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    return {
      post_id: (posts as ApprovedPost[])[i].id,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    }
  })

  const hasError = results.some((r) => r.status === 'rejected')

  return NextResponse.json(
    { results: response },
    { status: hasError ? 207 : 200 }
  )
}
