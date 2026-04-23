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
│   └── crypto.ts                  # AES-256-GCM 暗号化/復号ユーティリティ
supabase/
└── schema.sql                     # personas / posts / settings テーブル DDL（手動実行用）
```

## Stepの進捗
- [x] Step 1: 初期セットアップ
- [x] Step 2: SupabaseテーブルSQL出力
- [ ] Step 3: Geminiツイート生成 + DB保存
- [ ] Step 4: LINE Webhook + 通知送信
- [ ] Step 5: X API投稿実行（暗号化復号）
- [ ] Step 6: ダッシュボードUI

## 環境変数
| キー名 | 用途 | 設定済み |
|--------|------|---------|
| ENCRYPTION_KEY | AES-256-GCM 暗号化マスターキー | ✅ |
| SUPABASE_URL | SupabaseプロジェクトURL | ✅ |
| SUPABASE_ANON_KEY | Supabase匿名キー | ✅ |
| GEMINI_API_KEY | Gemini API | ✅ |
| LINE_CHANNEL_ACCESS_TOKEN | LINE送信用 | ✅ |
| LINE_CHANNEL_SECRET | LINE Webhook署名検証 | ✅ |
| X_API_KEY | X API Key | ✅ |
| X_API_SECRET | X API Secret | ✅ |
| X_ACCESS_TOKEN | X Access Token（暗号化してDB保存） | ✅ |
| X_ACCESS_SECRET | X Access Secret（暗号化してDB保存） | ✅ |

## 未解決の課題
なし

## 次の着手内容
Step 3: Geminiツイート生成 + DB保存（src/lib/supabase.ts / src/lib/gemini.ts / src/app/api/generate/route.ts）
