import { TwitterApi } from 'twitter-api-v2'
import { decrypt } from './crypto'

/**
 * x_credentials_encrypted に格納される JSON フォーマット
 * encrypt(JSON.stringify({ accessToken, accessSecret })) で作成する
 */
type XCredentials = {
  accessToken: string
  accessSecret: string
}

/**
 * ペルソナの暗号化済み X 認証情報を復号して TwitterApi クライアントを生成する
 *
 * - appKey / appSecret は環境変数から取得（共通）
 * - accessToken / accessSecret は DB の x_credentials_encrypted から復号（ペルソナ固有）
 * - 直接 process.env.X_ACCESS_TOKEN 等を参照することは禁止
 */
export function createTwitterClient(xCredentialsEncrypted: string): TwitterApi {
  const appKey = process.env.X_API_KEY
  const appSecret = process.env.X_API_SECRET
  if (!appKey) throw new Error('X_API_KEY が設定されていません')
  if (!appSecret) throw new Error('X_API_SECRET が設定されていません')

  // crypto.ts 経由で復号 — 直接 env 参照禁止
  const raw = decrypt(xCredentialsEncrypted)
  const credentials: XCredentials = JSON.parse(raw)

  if (!credentials.accessToken || !credentials.accessSecret) {
    throw new Error('復号した X 認証情報に accessToken または accessSecret が含まれていません')
  }

  return new TwitterApi({
    appKey,
    appSecret,
    accessToken: credentials.accessToken,
    accessSecret: credentials.accessSecret,
  })
}

/**
 * ツイートを投稿し、X 上のツイート ID を返す
 */
export async function postTweet(
  xCredentialsEncrypted: string,
  content: string
): Promise<string> {
  const client = createTwitterClient(xCredentialsEncrypted)
  const result = await client.v2.tweet(content)
  return result.data.id
}

export type TweetMetrics = {
  likes: number
  retweets: number
  impressions: number
}

/**
 * 指定ツイートのエンゲージメント指標を X API v2 から取得する
 * public_metrics を使用（Basic Access 以上で利用可能）
 */
export async function getTweetMetrics(
  xCredentialsEncrypted: string,
  tweetId: string
): Promise<TweetMetrics> {
  const client = createTwitterClient(xCredentialsEncrypted)
  const tweet = await client.v2.singleTweet(tweetId, {
    'tweet.fields': ['public_metrics'],
  })
  const m = tweet.data.public_metrics
  return {
    likes: m?.like_count ?? 0,
    retweets: (m?.retweet_count ?? 0) + (m?.quote_count ?? 0),
    impressions: m?.impression_count ?? 0,
  }
}
