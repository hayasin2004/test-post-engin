import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY が設定されていません')
  if (key.length !== 64) throw new Error('ENCRYPTION_KEY は64文字のhex文字列（32バイト）である必要があります')
  return Buffer.from(key, 'hex')
}

// 暗号化結果フォーマット: "iv_hex:authTag_hex:ciphertext_hex"
export function encrypt(text: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(encrypted: string): string {
  const key = getKey()
  const parts = encrypted.split(':')
  if (parts.length !== 3) throw new Error('暗号化データのフォーマットが不正です')
  const [ivHex, authTagHex, ciphertext] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8')
}
