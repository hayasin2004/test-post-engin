import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import styles from './trends.module.css'

type TrendRow = {
  id: string
  date: string
  topic_category: string
  content: string
  created_at: string
}

const CATEGORY_LABELS: Record<string, string> = {
  tech:   'IT・技術ニュース',
  market: '株価・経済動向',
  sns:    'SNSトレンド（X・TikTok）',
  local:  '名古屋・愛知ローカル情報',
}

const CATEGORY_ORDER = ['tech', 'market', 'sns', 'local']

/**
 * /dashboard/trends
 * Server Component: 直近14日分のトレンドレポートを日付グループで表示する
 */
export default async function TrendsPage() {
  const { data: rows } = await supabase
    .from('daily_trends')
    .select('id, date, topic_category, content, created_at')
    .order('date', { ascending: false })
    .order('topic_category', { ascending: true })
    .limit(14 * 4) // 14日 × 4カテゴリ

  const trends = (rows as TrendRow[]) ?? []

  // 日付でグルーピング
  const grouped = trends.reduce<Record<string, TrendRow[]>>((acc, row) => {
    if (!acc[row.date]) acc[row.date] = []
    acc[row.date].push(row)
    return acc
  }, {})

  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link href="/dashboard" className={styles.backLink}>← ダッシュボード</Link>
        <h1 className={styles.title}>トレンドレポート</h1>
        <p className={styles.subtitle}>毎朝 10:00 に Gemini googleSearch で収集した情報です</p>
      </div>

      {dates.length === 0 ? (
        <p className={styles.empty}>
          まだトレンドが収集されていません。<br />
          <code>/api/cron/collect</code> を実行してください。
        </p>
      ) : (
        dates.map((date) => {
          const dayRows = grouped[date]
          const sorted = CATEGORY_ORDER
            .map((key) => dayRows.find((r) => r.topic_category === key))
            .filter((r): r is TrendRow => r !== undefined)

          return (
            <section key={date} className={styles.daySection}>
              <h2 className={styles.dateHeading}>{date}</h2>
              <div className={styles.categoryGrid}>
                {sorted.map((row) => (
                  <div key={row.id} className={`${styles.categoryCard} ${styles[`cat_${row.topic_category}`]}`}>
                    <h3 className={styles.categoryLabel}>
                      {CATEGORY_LABELS[row.topic_category] ?? row.topic_category}
                    </h3>
                    <p className={styles.categoryContent}>{row.content}</p>
                  </div>
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
