import { supabase, Persona, Post } from '@/lib/supabase'
import DashboardClient from './DashboardClient'

type PostWithPersona = Post & {
  personas: Pick<Persona, 'name'> | null
}

/**
 * Server Component: 初期データをサーバーサイドで取得して
 * DashboardClient（Client Component）に渡す
 */
export default async function DashboardPage() {
  const [{ data: personas }, { data: posts }] = await Promise.all([
    supabase.from('personas').select('*').order('created_at', { ascending: true }),
    supabase
      .from('posts')
      .select('*, personas(name)')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  return (
    <DashboardClient
      initialPersonas={(personas as Persona[]) ?? []}
      initialPosts={(posts as PostWithPersona[]) ?? []}
    />
  )
}
