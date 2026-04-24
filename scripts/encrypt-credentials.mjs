/**
 * X Access Token / Access Secret を AES-256-GCM で暗号化するスクリプト
 * 実行: node scripts/encrypt-credentials.mjs
 *
 * 出力された文字列を Supabase の personas.x_credentials_encrypted に INSERT する
 */

import { createCipheriv, randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

// .env.local を手動パース（dotenv 不要）
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf8')

const env = {}
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const idx = trimmed.indexOf('=')
  if (idx === -1) continue
  env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
}

// 必要な環境変数を取得
const ENCRYPTION_KEY = env['ENCRYPTION_KEY']
const X_ACCESS_TOKEN  = env['X_ACCESS_TOKEN']
const X_ACCESS_SECRET = env['X_ACCESS_SECRET']

if (!ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY が .env.local にありません')
if (ENCRYPTION_KEY.length !== 64) throw new Error('ENCRYPTION_KEY は64文字のhex文字列である必要があります')
if (!X_ACCESS_TOKEN)  throw new Error('X_ACCESS_TOKEN が .env.local にありません')
if (!X_ACCESS_SECRET) throw new Error('X_ACCESS_SECRET が .env.local にありません')

/**
 * crypto.ts の encrypt() と同一ロジック
 * フォーマット: "iv_hex:authTag_hex:ciphertext_hex"
 */
function encrypt(text) {
  const key = Buffer.from(ENCRYPTION_KEY, 'hex')
  const iv  = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

// twitter.ts が JSON.parse() を期待しているため JSON 形式で暗号化する
const plaintext = JSON.stringify({ accessToken: X_ACCESS_TOKEN, accessSecret: X_ACCESS_SECRET })
const encrypted = encrypt(plaintext)

console.log('=== 暗号化完了 ===')
console.log()
console.log('x_credentials_encrypted の値:')
console.log(encrypted)
console.log()
console.log('--- Supabase INSERT 用 SQL（名前・トーン・トピックは適宜変更） ---')
console.log(`INSERT INTO personas (name, tone, topics, x_credentials_encrypted)`)
console.log(`VALUES (`)
console.log(`  '模擬エンジニア学生',`)
console.log(`  'カジュアル・テック寄り',`)
console.log(`  '["AI", "プログラミング", "学生生活"]',`)
console.log(`  '${encrypted}'`)
console.log(`);`)
