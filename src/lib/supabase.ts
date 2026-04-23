import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl) throw new Error('SUPABASE_URL が設定されていません')
if (!supabaseAnonKey) throw new Error('SUPABASE_ANON_KEY が設定されていません')

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ---- 型定義 ----

export type Persona = {
  id: string
  name: string
  tone: string
  topics: string[]
  x_credentials_encrypted: string
  created_at: string
}

export type PostStatus = 'generated' | 'approved' | 'posted' | 'rejected'

export type Post = {
  id: string
  persona_id: string
  content: string
  status: PostStatus
  tweet_id: string | null
  scheduled_at: string | null
  posted_at: string | null
  created_at: string
}

export type PostMetric = {
  id: string
  post_id: string
  tweet_id: string
  likes: number
  retweets: number
  impressions: number
  collected_at: string
}
