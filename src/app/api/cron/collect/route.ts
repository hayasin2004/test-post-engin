import { NextResponse } from 'next/server'
import { GoogleGenerativeAI, Tool } from '@google/generative-ai'
import { supabase } from '@/lib/supabase'
import { sendTrendReport, type TrendEntry } from '@/lib/line'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

type CategoryDef = {
  key: 'tech' | 'market' | 'sns' | 'local'
  label: string
  prompt: string
}

const CATEGORIES: CategoryDef[] = [
  {
    key: 'tech',
    label: 'IT・技術ニュース',
    prompt:
      '今日のIT・テクノロジー分野の最新ニュースを3〜5件、箇条書きで要約してください（各項目1〜2文）。',
  },
  {
    key: 'market',
    label: '株価・経済動向',
    prompt:
      '今日の日本および主要国の株式市場・経済動向を3〜5点、箇条書きで要約してください（各項目1〜2文）。',
  },
  {
    key: 'sns',
    label: 'SNSトレンド（X・TikTok）',
    prompt:
      '現在XおよびTikTokで話題になっているトレンドやバズトピックを3〜5件、箇条書きで要約してください（各項目1〜2文）。',
  },
  {
    key: 'local',
    label: '名古屋・愛知ローカル情報',
    prompt:
      '愛知県名古屋市周辺の今日のローカルニュースや地域の話題を3〜5件、箇条書きで要約してください（各項目1〜2文）。',
  },
]

/**
 * GET /api/cron/collect
 *
 * Vercel Cron（毎朝 10:00 JST = UTC 01:00）から呼び出される。
 * Gemini googleSearch で4カテゴリのトレンドを収集し、
 * daily_trends テーブルへ保存 + daily_trend/yyyy_mm_dd.md を出力する。
 */
export async function GET(request: Request) {
  // Vercel Cron 認証（CRON_SECRET が設定されている場合のみ検証）
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 })
    }
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY が設定されていません' },
      { status: 500 }
    )
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const tools: Tool[] = [{ googleSearch: {} } as unknown as Tool]
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', tools })

  // JSTで今日の日付を計算（UTC+9）
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const today = jstNow.toISOString().slice(0, 10) // yyyy-mm-dd
  const sections: string[] = []
  const contentMap = new Map<string, string>() // category.key → content
  const results: Array<{ category: string; success: boolean; error?: string }> = []

  for (const cat of CATEGORIES) {
    try {
      const geminiResult = await model.generateContent(cat.prompt)
      const content = geminiResult.response.text().trim()

      // 同日・同カテゴリが既存の場合は上書き（cronの再実行・リトライに対応）
      const { error: insertError } = await supabase.from('daily_trends').upsert(
        {
          date: today,
          topic_category: cat.key,
          content,
          raw_data: {
            model: 'gemini-2.5-flash',
            generated_at: new Date().toISOString(),
          },
        },
        { onConflict: 'date,topic_category' }
      )

      if (insertError) throw new Error(insertError.message)

      sections.push(`## ${cat.label}\n\n${content}`)
      contentMap.set(cat.key, content)
      results.push({ category: cat.key, success: true })
    } catch (err) {
      results.push({
        category: cat.key,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Markdown レポートファイルを出力
  if (sections.length > 0) {
    const dateSlug = today.replace(/-/g, '_')
    const jstTime = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
    const mdLines: string[] = [
      `# ${today} トレンドレポート`,
      '',
      `> 生成日時: ${jstTime}`,
      '',
    ]
    sections.forEach((sec, i) => {
      mdLines.push(sec)
      if (i < sections.length - 1) mdLines.push('', '---', '')
    })
    const mdContent = mdLines.join('\n') + '\n'

    try {
      // Vercel 本番では /tmp（書き込み可能領域）、ローカルでは daily_trend/
      const dir = process.env.VERCEL
        ? '/tmp/daily_trend'
        : path.join(process.cwd(), 'daily_trend')
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, `${dateSlug}.md`), mdContent, 'utf-8')
    } catch (fileErr) {
      console.error('[cron/collect] MDファイル書き込み失敗:', fileErr)
    }
  }

  // 成功したカテゴリのトレンドを LINE Flex Message で送信
  if (contentMap.size > 0) {
    const linePayload: TrendEntry[] = Array.from(contentMap.entries()).map(
      ([topic_category, content]) => ({ topic_category, content })
    )
    try {
      await sendTrendReport(linePayload, today)
    } catch (lineErr) {
      console.error('[cron/collect] LINE 送信失敗:', lineErr)
    }
  }

  const hasError = results.some((r) => !r.success)
  return NextResponse.json({ date: today, results }, { status: hasError ? 207 : 200 })
}
