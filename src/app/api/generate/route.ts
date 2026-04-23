import { NextResponse } from 'next/server'
import { supabase, Persona } from '@/lib/supabase'
import { generateTweet } from '@/lib/gemini'
import { sendTweetNotification } from '@/lib/line'

/**
 * POST /api/generate
 *
 * すべてのペルソナに対してツイートを生成し、
 * posts テーブルへ status = "generated" で保存した後、
 * LINE に通知を送信する。
 *
 * レスポンス例:
 * {
 *   "results": [
 *     { "persona_id": "...", "persona_name": "...", "post_id": "...", "content": "..." },
 *     { "persona_id": "...", "persona_name": "...", "error": "..." }
 *   ]
 * }
 */
export async function POST() {
  // 本日のトレンド情報を取得（JSTで日付計算）
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const today = jstNow.toISOString().slice(0, 10)
  const { data: trendsData } = await supabase
    .from('daily_trends')
    .select('topic_category, content')
    .eq('date', today)

  const todayTrends =
    trendsData && trendsData.length > 0
      ? (trendsData as Array<{ topic_category: string; content: string }>)
          .map((t) => `[${t.topic_category}]\n${t.content}`)
          .join('\n\n')
      : undefined

  // エンゲージメント上位5件の投稿内容を取得（フィードバックループ）
  const { data: topMetrics } = await supabase
    .from('post_metrics')
    .select('posts(content)')
    .order('likes', { ascending: false })
    .limit(5)

  const topPosts = (
    topMetrics as Array<{ posts: { content: string } | null }> | null
  )
    ?.map((m) => m.posts?.content)
    .filter((c): c is string => typeof c === 'string') ?? []

  // 全ペルソナを取得
  const { data: personas, error: fetchError } = await supabase
    .from('personas')
    .select('*')

  if (fetchError) {
    return NextResponse.json(
      { error: 'ペルソナの取得に失敗しました', detail: fetchError.message },
      { status: 500 }
    )
  }

  if (!personas || personas.length === 0) {
    return NextResponse.json({ results: [], message: 'ペルソナが登録されていません' })
  }

  // ペルソナは並列生成せず順番に処理する（LINE通知は1件ずつ送るため）
  const results: PromiseSettledResult<{
    persona_id: string
    persona_name: string
    post_id: string
    content: string
  }>[] = []

  for (const persona of personas as Persona[]) {
    const result = await (async () => {
      // Gemini でツイート生成（トレンド + エンゲージメント上位パターンを注入）
      const content = await generateTweet(persona, todayTrends, topPosts)

      // posts テーブルへ保存
      const { data: post, error: insertError } = await supabase
        .from('posts')
        .insert({
          persona_id: persona.id,
          content,
          status: 'generated',
        })
        .select('id')
        .single()

      if (insertError) {
        throw new Error(`投稿の保存に失敗しました (persona: ${persona.name}): ${insertError.message}`)
      }

      const postId = (post as { id: string }).id

      // LINE に通知送信（承認/却下を促すメッセージ）
      await sendTweetNotification(postId, persona.name, content)

      return {
        persona_id: persona.id,
        persona_name: persona.name,
        post_id: postId,
        content,
      }
    })().then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason: unknown) => ({ status: 'rejected' as const, reason })
    )
    results.push(result)
  }

  const response = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    return {
      persona_id: (personas as Persona[])[i].id,
      persona_name: (personas as Persona[])[i].name,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    }
  })

  const hasError = results.some((r) => r.status === 'rejected')

  return NextResponse.json(
    { results: response },
    { status: hasError ? 207 : 200 }
  )
}
