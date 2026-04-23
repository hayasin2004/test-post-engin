## プロダクト概要
マルチペルソナX自動投稿システム

## アーキテクチャ
- DB: Supabase | 理由: サーバーレス対応、リアルタイム購読、無料枠充実
- UI: CSS Modules | 理由: Tailwind禁止制約、スコープ付きCSSで保守性確保 | 却下: Tailwind(制約禁止), Styled-components(ランタイムコスト)
- AI: Gemini 1.5 Flash | 理由: googleSearchグラウンディング対応、高速低コスト
- 通知: LINE Messaging API | 理由: 個人利用に最適、承認フローのUX

## 実装済みファイルマップ
```
src/
├── lib/
│   ├── crypto.ts                  # AES-256-GCM 暗号化/復号ユーティリティ
│   ├── supabase.ts                # Supabase クライアント + 型定義（Post.tweet_id / PostMetric 追加）
│   ├── gemini.ts                  # Gemini ツイート生成（トレンド・高エンゲージメントパターン注入）
│   ├── line.ts                    # LINE 通知送信 + レビュー中 post_id 管理
│   └── twitter.ts                 # X API 投稿 + エンゲージメント指標取得
├── app/
│   ├── dashboard/
│   │   ├── page.tsx               # Server Component: 初期データ取得
│   │   ├── DashboardClient.tsx    # Client Component: ペルソナ管理UI + 投稿履歴
│   │   ├── page.module.css        # ダッシュボード用スタイル（CSS Modules）
│   │   └── trends/
│   │       ├── page.tsx           # トレンドレポート閲覧ページ（カテゴリ別・日付グループ）
│   │       └── trends.module.css  # トレンドページ用スタイル
│   └── api/
│       ├── generate/
│       │   └── route.ts           # POST /api/generate: トレンド + 高エンゲージメントパターン注入
│       ├── personas/
│       │   └── route.ts           # POST/DELETE /api/personas: ペルソナCRUD（サーバー側暗号化）
│       ├── cron/
│       │   ├── collect/
│       │   │   └── route.ts       # GET /api/cron/collect: 毎朝トレンド収集（10:00 JST）
│       │   ├── metrics/
│       │   │   └── route.ts       # GET /api/cron/metrics: エンゲージメント収集（毎朝 12:00 JST）
│       │   └── post-scheduled/
│       │       └── route.ts       # GET /api/cron/post-scheduled: スケジュール投稿（30分ごと）
│       ├── line/
│       │   └── webhook/
│       │       └── route.ts       # POST /api/line/webhook: 署名検証・承認/却下処理
│       └── post/
│           └── route.ts           # POST /api/post: approved 投稿を X に投稿→tweet_id 保存
supabase/
└── schema.sql                     # 全テーブル DDL（posts 拡張・post_metrics・daily_trends 追加）
daily_trend/
└── yyyy_mm_dd.md                  # Cronジョブが毎朝生成するトレンドレポート
vercel.json                        # Vercel Cron × 3（collect / metrics / post-scheduled）
tests/
└── api/
    ├── cron-collect-logic.test.mjs    # 11テスト
    ├── cron-metrics-logic.test.mjs    # 8テスト
    ├── cron-scheduled-logic.test.mjs  # 8テスト
    └── personas-api-logic.test.mjs    # 10テスト
```

## Stepの進捗
- [x] Step 1: 初期セットアップ
- [x] Step 2: SupabaseテーブルSQL出力
- [x] Step 3: Geminiツイート生成 + DB保存
- [x] Step 4: LINE Webhook + 通知送信
- [x] Step 5: X API投稿実行（暗号化復号）
- [x] Step 6: ダッシュボードUI
- [x] Step 7: トレンド収集エンジン（daily_trends・Cron・ツイート生成統合）
- [x] Step 8: エンゲージメント収集 + フィードバックループ（post_metrics・cron/metrics・Gemini注入）
- [x] Step 9: スケジュール投稿（posts.scheduled_at・cron/post-scheduled）
- [x] Step 10: ダッシュボード強化（ペルソナ管理UI・トレンドレポート閲覧ページ）

## 環境変数
| キー名 | 用途 | 設定済み |
|--------|------|---------|
| ENCRYPTION_KEY | AES-256-GCM 暗号化マスターキー | ✅ |
| SUPABASE_URL | SupabaseプロジェクトURL | ✅ |
| SUPABASE_ANON_KEY | Supabase匿名キー | ✅ |
| GEMINI_API_KEY | Gemini API | ✅ |
| LINE_CHANNEL_ACCESS_TOKEN | LINE送信用 | ✅ |
| LINE_CHANNEL_SECRET | LINE Webhook署名検証 | ✅ |
| LINE_USER_ID | LINE Push 送信先ユーザーID | ✅ |
| X_API_KEY | X API Key | ✅ |
| X_API_SECRET | X API Secret | ✅ |
| X_ACCESS_TOKEN | X Access Token（暗号化してDB保存） | ✅ |
| X_ACCESS_SECRET | X Access Secret（暗号化してDB保存） | ✅ |

## 未解決の課題
- Supabase SQL Editor で schema.sql の差分 DDL（posts 拡張 + post_metrics + daily_trends）を手動実行すること
- CRON_SECRET 環境変数を Vercel に設定するとCron不正呼び出しを防げる（任意）
- Vercel 本番環境ではファイルシステムへの書き込みが非永続のため、`daily_trend/` MDファイルは `/tmp` に一時出力される（DBへの保存は永続）
- X API public_metrics はBasic Access以上が必要（エンゲージメント収集 cron/metrics の前提）

## デプロイ
- URL: https://engineer-auto-post-nmg6c5efe-hayasin2004s-projects.vercel.app
- プラットフォーム: Vercel
- デプロイ完了日: 2026-04-23

## 次の着手内容
全 Step 完了・デプロイ済み。本番運用開始前に以下を実施すること:
- Supabase SQL Editor で supabase/schema.sql を手動実行
- personas テーブルにペルソナを登録（x_credentials_encrypted は encrypt() で暗号化して保存）
- LINE Developers で Webhook URL を `https://engineer-auto-post-nmg6c5efe-hayasin2004s-projects.vercel.app/api/line/webhook` に設定
- /api/post および LINE 実通知は停止ポイント（人間確認後に実行）
