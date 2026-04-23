import { GoogleGenerativeAI, Tool } from '@google/generative-ai'
import { supabase, Persona, Post } from './supabase'

const RECENT_POSTS_LIMIT = 30

// 日常的な発言のキーワード（これらを含む場合は重複チェックを緩和）
const CASUAL_KEYWORDS = [
  'おなかすいた', 'おなかへった', '眠い', 'ねむい', '疲れた', 'つかれた',
  'コーヒー', '眠れない', '休憩', 'ひと息', 'のんびり',
]

function isCasualContent(content: string): boolean {
  return CASUAL_KEYWORDS.some((kw) => content.includes(kw))
}

/**
 * 過去30件の投稿からキーワードセットを構築し、
 * 新しい投稿案がネタ被りしていないか判定する
 */
function hasTopicOverlap(candidate: string, recentContents: string[]): boolean {
  if (isCasualContent(candidate)) return false // 日常発言は重複許容

  // 候補から4文字以上のトークンを抽出して過去投稿と照合
  const candidateTokens = extractTokens(candidate)
  for (const past of recentContents) {
    const pastTokens = extractTokens(past)
    const shared = candidateTokens.filter((t) => pastTokens.includes(t))
    if (shared.length >= 3) return true // 3トークン以上一致 → 被りと判断
  }
  return false
}

function extractTokens(text: string): string[] {
  // 句読点・記号を除いた4文字以上の連続文字列をトークンとして抽出
  return (text.match(/[\u3040-\u9FFF\w]{4,}/g) ?? [])
}

/**
 * 指定ペルソナのツイート候補を Gemini で生成する
 * @param todayTrends  daily_trends テーブルから取得した本日のトレンド文字列（任意）
 * @param topPosts     過去の高エンゲージメント投稿の内容一覧（任意、フィードバックループ用）
 */
export async function generateTweet(
  persona: Persona,
  todayTrends?: string,
  topPosts?: string[]
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません')

  const genAI = new GoogleGenerativeAI(apiKey)

  // googleSearch グラウンディングツールを有効化
  const tools: Tool[] = [{ googleSearch: {} } as unknown as Tool]

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools,
  })

  // 過去30件の投稿を取得してネタ被り防止プロンプトに組み込む
  const { data: recentPosts } = await supabase
    .from('posts')
    .select('content')
    .eq('persona_id', persona.id)
    .order('created_at', { ascending: false })
    .limit(RECENT_POSTS_LIMIT)

  const recentContents: string[] = (recentPosts as Pick<Post, 'content'>[] | null)?.map(
    (p) => p.content
  ) ?? []

  const recentSummary =
    recentContents.length > 0
      ? `\n\n【過去の投稿（重複禁止）】\n${recentContents.slice(0, 10).join('\n')}`
      : ''

  // 本日のトレンド情報をプロンプトに注入（取得できた場合のみ）
  const trendsSection = todayTrends
    ? `\n\n【本日の参考情報】\n以下のトレンドを参考に、キャラクターの視点から自然に話題に盛り込んでください（強制はしない）。\n${todayTrends}`
    : ''

  // 高エンゲージメント投稿のパターンを注入（フィードバックループ）
  const topPostsSection =
    topPosts && topPosts.length > 0
      ? `\n\n【過去に反応が良かった投稿（文体・話題の傾向を参考に）】\n${topPosts.slice(0, 5).join('\n')}`
      : ''

  const prompt = `あなたは「${persona.name}」というSNSキャラクターです。
口調: ${persona.tone}
得意トピック: ${persona.topics.join(', ')}

以下の条件でXへの投稿文を1件だけ作成してください。
- 140文字以内（日本語）
- ハッシュタグは1〜2個まで
- 宣伝・商品紹介は禁止
- 過去の投稿と同じ話題は避けること${recentSummary}${trendsSection}${topPostsSection}

投稿文のみを出力してください（前置き・解説・引用符は不要）。`

  const result = await model.generateContent(prompt)
  const candidate = result.response.text().trim()

  // ネタ被りチェック（被っていれば再生成を1回だけ試みる）
  if (hasTopicOverlap(candidate, recentContents)) {
    const retryResult = await model.generateContent(
      prompt + '\n\n※先ほどの案とは全く異なる話題で作成してください。'
    )
    return retryResult.response.text().trim()
  }

  return candidate
}
