'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase, Persona, Post, PostStatus } from '@/lib/supabase'
import styles from './page.module.css'

// ---- 型 ----

type PostWithPersona = Post & {
  personas: Pick<Persona, 'name'> | null
}

type Props = {
  initialPersonas: Persona[]
  initialPosts: PostWithPersona[]
}

// ---- 定数 ----

const ALL_STATUSES: PostStatus[] = ['generated', 'approved', 'posted', 'rejected']

const FILTER_LABELS: Record<PostStatus | 'all', string> = {
  all: 'すべて',
  generated: '生成済',
  approved: '承認済',
  posted: '投稿済',
  rejected: '却下',
}

// ---- ユーティリティ ----

function badgeClass(status: PostStatus): string {
  return {
    generated: styles.badgeGenerated,
    approved: styles.badgeApproved,
    posted: styles.badgePosted,
    rejected: styles.badgeRejected,
  }[status]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---- ペルソナ追加フォームの初期値 ----

const EMPTY_FORM = {
  name: '',
  tone: '',
  topics: '',
  accessToken: '',
  accessSecret: '',
}

// ---- Client Component ----

export default function DashboardClient({ initialPersonas, initialPosts }: Props) {
  const [personas, setPersonas] = useState<Persona[]>(initialPersonas)
  const [posts, setPosts] = useState<PostWithPersona[]>(initialPosts)
  const [filter, setFilter] = useState<PostStatus | 'all'>('all')
  const [generating, setGenerating] = useState(false)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // ペルソナ管理
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState(EMPTY_FORM)
  const [addingPersona, setAddingPersona] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ツイート生成
  const handleGenerate = async () => {
    setGenerating(true)
    setFeedback(null)

    try {
      const res = await fetch('/api/generate', { method: 'POST' })
      const json = await res.json()
      const errors = (json.results ?? []).filter((r: { error?: string }) => r.error)

      if (errors.length > 0) {
        setFeedback({
          type: 'error',
          message: `一部の生成に失敗しました: ${errors
            .map((e: { error: string }) => e.error)
            .join(' / ')}`,
        })
      } else {
        setFeedback({
          type: 'success',
          message: `${json.results?.length ?? 0} 件のツイートを生成しました`,
        })
      }

      const { data: refreshed } = await supabase
        .from('posts')
        .select('*, personas(name)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (refreshed) setPosts(refreshed as PostWithPersona[])

      const { data: refreshedPersonas } = await supabase
        .from('personas')
        .select('*')
        .order('created_at', { ascending: true })
      if (refreshedPersonas) setPersonas(refreshedPersonas as Persona[])
    } catch (e) {
      setFeedback({ type: 'error', message: `エラーが発生しました: ${String(e)}` })
    } finally {
      setGenerating(false)
    }
  }

  // ペルソナ追加
  const handleAddPersona = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddingPersona(true)
    setFeedback(null)

    try {
      const res = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name.trim(),
          tone: addForm.tone.trim(),
          topics: addForm.topics.split(',').map((t) => t.trim()).filter(Boolean),
          accessToken: addForm.accessToken.trim(),
          accessSecret: addForm.accessSecret.trim(),
        }),
      })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error ?? '登録に失敗しました')
      }

      setFeedback({ type: 'success', message: `ペルソナ「${addForm.name}」を登録しました` })
      setAddForm(EMPTY_FORM)
      setShowAddForm(false)

      const { data: refreshed } = await supabase
        .from('personas')
        .select('*')
        .order('created_at', { ascending: true })
      if (refreshed) setPersonas(refreshed as Persona[])
    } catch (err) {
      setFeedback({ type: 'error', message: String(err) })
    } finally {
      setAddingPersona(false)
    }
  }

  // ペルソナ削除
  const handleDeletePersona = async (id: string, name: string) => {
    if (!confirm(`ペルソナ「${name}」を削除しますか？\n関連する投稿もすべて削除されます。`)) return
    setDeletingId(id)
    setFeedback(null)

    try {
      const res = await fetch(`/api/personas?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? '削除に失敗しました')
      }

      setFeedback({ type: 'success', message: `ペルソナ「${name}」を削除しました` })
      setPersonas((prev) => prev.filter((p) => p.id !== id))
      setPosts((prev) => prev.filter((p) => p.persona_id !== id))
    } catch (err) {
      setFeedback({ type: 'error', message: String(err) })
    } finally {
      setDeletingId(null)
    }
  }

  // フィルタ適用
  const filteredPosts =
    filter === 'all' ? posts : posts.filter((p) => p.status === filter)

  return (
    <div className={styles.container}>
      {/* ヘッダー */}
      <div className={styles.header}>
        <h1 className={styles.title}>ダッシュボード</h1>
        <div className={styles.headerActions}>
          <Link href="/dashboard/trends" className={styles.linkBtn}>
            トレンドレポート
          </Link>
          <button
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? '生成中…' : 'ツイートを生成'}
          </button>
        </div>
      </div>

      {/* フィードバック */}
      {feedback && (
        <div
          className={`${styles.feedback} ${
            feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* ペルソナ一覧 */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>ペルソナ一覧</h2>
          <button
            className={styles.addBtn}
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? 'キャンセル' : '+ 追加'}
          </button>
        </div>

        {/* ペルソナ追加フォーム */}
        {showAddForm && (
          <form className={styles.addForm} onSubmit={handleAddPersona}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>名前</label>
              <input
                className={styles.formInput}
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="テック太郎"
                required
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>口調</label>
              <input
                className={styles.formInput}
                value={addForm.tone}
                onChange={(e) => setAddForm((f) => ({ ...f, tone: e.target.value }))}
                placeholder="テック寄り・丁寧"
                required
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>トピック（カンマ区切り）</label>
              <input
                className={styles.formInput}
                value={addForm.topics}
                onChange={(e) => setAddForm((f) => ({ ...f, topics: e.target.value }))}
                placeholder="AI, TypeScript, Web開発"
                required
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>X Access Token</label>
              <input
                className={styles.formInput}
                type="password"
                value={addForm.accessToken}
                onChange={(e) => setAddForm((f) => ({ ...f, accessToken: e.target.value }))}
                placeholder="Access Token"
                required
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>X Access Secret</label>
              <input
                className={styles.formInput}
                type="password"
                value={addForm.accessSecret}
                onChange={(e) => setAddForm((f) => ({ ...f, accessSecret: e.target.value }))}
                placeholder="Access Token Secret"
                required
              />
            </div>
            <button
              type="submit"
              className={styles.generateBtn}
              disabled={addingPersona}
            >
              {addingPersona ? '登録中…' : '登録する'}
            </button>
          </form>
        )}

        {personas.length === 0 ? (
          <p className={styles.empty}>ペルソナが登録されていません</p>
        ) : (
          <div className={styles.personaGrid}>
            {personas.map((persona) => (
              <div key={persona.id} className={styles.personaCard}>
                <div className={styles.personaCardHeader}>
                  <p className={styles.personaName}>{persona.name}</p>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDeletePersona(persona.id, persona.name)}
                    disabled={deletingId === persona.id}
                    title="削除"
                  >
                    {deletingId === persona.id ? '…' : '削除'}
                  </button>
                </div>
                <p className={styles.personaTone}>{persona.tone}</p>
                <div className={styles.personaTopics}>
                  {persona.topics.map((topic) => (
                    <span key={topic} className={styles.topicTag}>
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 投稿履歴 */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>投稿履歴</h2>

        {/* フィルター */}
        <div className={styles.filterBar}>
          {(['all', ...ALL_STATUSES] as const).map((s) => (
            <button
              key={s}
              className={`${styles.filterBtn} ${filter === s ? styles.filterBtnActive : ''}`}
              onClick={() => setFilter(s)}
            >
              {FILTER_LABELS[s]}
              {s !== 'all' && (
                <span> ({posts.filter((p) => p.status === s).length})</span>
              )}
            </button>
          ))}
        </div>

        {/* 投稿リスト */}
        {filteredPosts.length === 0 ? (
          <p className={styles.empty}>該当する投稿がありません</p>
        ) : (
          <div className={styles.postList}>
            {filteredPosts.map((post) => (
              <div key={post.id} className={styles.postCard}>
                <div className={styles.postMeta}>
                  <span className={styles.personaLabel}>
                    {post.personas?.name ?? '—'}
                  </span>
                  <span className={`${styles.badge} ${badgeClass(post.status)}`}>
                    {FILTER_LABELS[post.status]}
                  </span>
                  {post.scheduled_at && post.status === 'approved' && (
                    <span className={styles.scheduledLabel}>
                      {formatDate(post.scheduled_at)} 予定
                    </span>
                  )}
                  <span className={styles.postDate}>
                    {formatDate(post.created_at)}
                  </span>
                </div>
                <p className={styles.postContent}>{post.content}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
