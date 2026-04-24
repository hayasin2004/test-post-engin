# 残タスク一覧（next-task.md）

現在地: **Step 1 完了済み**（`src/lib/crypto.ts` 実装済み、環境変数設定済み）

---

## Step 2: Supabaseテーブル SQL出力

**ゴール**: `supabase/schema.sql` を生成する（手動実行用、自動実行しない）

- [ ] `supabase/schema.sql` を新規作成
  - `personas` テーブル: `id, name, tone, topics(jsonb), x_credentials_encrypted, created_at`
  - `posts` テーブル: `id, persona_id, content, status(generated/approved/posted/rejected), posted_at, created_at`
  - `settings` テーブル: `id, key, value_encrypted, updated_at`
- [ ] `npm run build` で型エラーがないことを確認
- [ ] `git commit: feat(supabase): Supabaseスキーマ SQL出力`
- [ ] `PROGRESS.md` を Step 2 完了に更新

---

## Step 3: Geminiツイート生成 + DB保存

**ゴール**: Gemini API でペルソナごとにツイートを生成し、`posts` テーブルに保存する

- [ ] `src/lib/supabase.ts` 作成（`@supabase/supabase-js` クライアント）
- [ ] `src/lib/gemini.ts` 作成
  - `googleSearch` ツール有効化
  - 過去30件の投稿をDBから取得してキーワード一致でネタ被り防止
  - 日常的発言（おなかすいた/眠い等）は重複許容
- [ ] `src/app/api/generate/route.ts` 作成
  - ペルソナごとにツイートを生成
  - 生成結果を `posts` テーブルへ `status = "generated"` で保存
- [ ] `npm run build` で通過確認
- [ ] `git commit: feat(api): Geminiツイート自動生成を実装`
- [ ] `PROGRESS.md` を Step 3 完了に更新

---

## Step 4: LINE Webhook + 通知送信

**ゴール**: 生成されたツイートをLINEで通知し、承認/却下をLINEメッセージで操作できるようにする

- [ ] `src/lib/line.ts` 作成
  - 通知フォーマット: `【ペルソナ名】\n{投稿内容}\n\n承認 or 却下`
  - LINE Messaging API で通知送信
- [ ] `src/app/api/line/webhook/route.ts` 作成
  - LINE Webhook 署名検証（`LINE_CHANNEL_SECRET` で HMAC-SHA256）
  - メッセージ解析: "承認" → `posts.status = "approved"`, "却下" → `posts.status = "rejected"`
- [ ] `npm run build` で通過確認
- [ ] `git commit: feat(api): LINE Webhook通知を実装`
- [ ] `PROGRESS.md` を Step 4 完了に更新

> **停止ポイント**: 実際のLINE通知送信は本番API呼び出しのため、人間の確認後に実施

---

## Step 5: X API投稿実行（暗号化復号）

**ゴール**: LINE承認済みの投稿をX APIで自動投稿する

- [ ] `src/lib/twitter.ts` 作成
  - `lib/crypto.ts` 経由で X Access Token/Secret を復号（直接参照禁止）
  - 復号した認証情報で X API v2 にツイート投稿
- [ ] `src/app/api/post/route.ts` 作成
  - `status = "approved"` の posts を取得
  - X API で投稿後、`status = "posted"`, `posted_at` を更新
- [ ] `npm run build` で通過確認
- [ ] `git commit: feat(api): X API投稿実行を実装`
- [ ] `PROGRESS.md` を Step 5 完了に更新

> **停止ポイント**: 実際のX投稿は本番API呼び出しのため、人間の確認後に実施

---

## Step 6: ダッシュボードUI

**ゴール**: ペルソナ一覧・投稿履歴・生成トリガーを操作できるダッシュボードを実装する

- [ ] `src/app/dashboard/page.tsx` 作成
  - ペルソナ一覧表示
  - 投稿履歴（status ごとにフィルタ可能）
  - ツイート生成トリガーボタン（`/api/generate` を呼び出し）
- [ ] `src/app/dashboard/page.module.css` 作成（CSS Modules、Tailwind禁止）
- [ ] `npm run build` && `npm run lint` 両方通過確認
- [ ] `PROGRESS.md` を最終状態に更新
- [ ] `git commit: feat(ui): ダッシュボードUIを実装`
- [ ] `git commit: docs: 最終状態をPROGRESS.mdに記録`

---

## 共通ルール（全Stepで遵守）

| 項目 | ルール |
|------|--------|
| DB操作 | Prisma禁止、`@supabase/supabase-js` のみ |
| 暗号化/復号 | 必ず `lib/crypto.ts` 経由 |
| CSS | CSS Modules のみ（Tailwind禁止） |
| 自己検証 | 各Step完了後に `npm run build` |
| commit | 日本語Karmaスタイル: `feat/fix/docs/refactor(<scope>): <subject>` |
| 環境変数 | `.env.local` の値をログ・出力に含めない |
