import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { encrypt } from '@/lib/crypto'

/**
 * POST /api/personas
 *
 * 新しいペルソナをブラウザから登録する。
 * X の accessToken / accessSecret はサーバー側で暗号化してから DB に保存する。
 *
 * リクエストボディ（JSON）:
 * {
 *   "name": "テック太郎",
 *   "tone": "テック寄り・丁寧",
 *   "topics": ["AI", "TypeScript"],
 *   "accessToken": "...",
 *   "accessSecret": "..."
 * }
 */
export async function POST(request: NextRequest) {
  let body: {
    name?: string
    tone?: string
    topics?: string[]
    accessToken?: string
    accessSecret?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  const { name, tone, topics, accessToken, accessSecret } = body

  if (!name || !tone || !Array.isArray(topics) || topics.length === 0) {
    return NextResponse.json(
      { error: 'name / tone / topics は必須です' },
      { status: 400 }
    )
  }

  if (!accessToken || !accessSecret) {
    return NextResponse.json(
      { error: 'accessToken / accessSecret は必須です' },
      { status: 400 }
    )
  }

  // X 認証情報をサーバー側で暗号化
  let xCredentialsEncrypted: string
  try {
    xCredentialsEncrypted = encrypt(JSON.stringify({ accessToken, accessSecret }))
  } catch (err) {
    return NextResponse.json(
      { error: '暗号化に失敗しました', detail: String(err) },
      { status: 500 }
    )
  }

  const { data, error } = await supabase
    .from('personas')
    .insert({ name, tone, topics, x_credentials_encrypted: xCredentialsEncrypted })
    .select('id, name, tone, topics, created_at')
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'ペルソナの保存に失敗しました', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ persona: data }, { status: 201 })
}

/**
 * DELETE /api/personas?id=<persona_id>
 *
 * ペルソナを削除する。関連する posts も CASCADE で削除される。
 */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id クエリパラメータが必要です' }, { status: 400 })
  }

  const { error } = await supabase.from('personas').delete().eq('id', id)

  if (error) {
    return NextResponse.json(
      { error: 'ペルソナの削除に失敗しました', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
