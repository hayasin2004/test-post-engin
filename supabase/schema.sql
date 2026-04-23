-- ============================================================
-- Engineer_Auto_Post: Supabase スキーマ定義
-- 手動実行用（Supabase SQL Editor に貼り付けて実行）
-- ============================================================

-- uuid_generate_v4() を使うための拡張
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- personas テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS personas (
  id                       UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                     TEXT        NOT NULL,
  tone                     TEXT        NOT NULL,
  topics                   JSONB       NOT NULL DEFAULT '[]',
  x_credentials_encrypted  TEXT        NOT NULL,  -- "iv:authTag:ciphertext" (AES-256-GCM)
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  personas                          IS 'Xに投稿するペルソナ情報';
COMMENT ON COLUMN personas.tone                     IS '投稿トーン（例: カジュアル / テック寄り）';
COMMENT ON COLUMN personas.topics                   IS '投稿トピック配列（例: ["AI","ゲーム"]）';
COMMENT ON COLUMN personas.x_credentials_encrypted IS 'X Access Token + Secret を暗号化した文字列';

-- ============================================================
-- posts テーブル
-- ============================================================
CREATE TYPE post_status AS ENUM ('generated', 'approved', 'posted', 'rejected');

CREATE TABLE IF NOT EXISTS posts (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  persona_id  UUID        NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  status      post_status NOT NULL DEFAULT 'generated',
  posted_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  posts            IS 'AI生成ツイートおよびその承認・投稿履歴';
COMMENT ON COLUMN posts.status     IS 'generated=生成済 / approved=承認済 / posted=投稿済 / rejected=却下';
COMMENT ON COLUMN posts.posted_at  IS 'X API で実際に投稿した日時（status=posted のときのみセット）';

CREATE INDEX IF NOT EXISTS idx_posts_persona_id ON posts(persona_id);
CREATE INDEX IF NOT EXISTS idx_posts_status     ON posts(status);

-- ============================================================
-- settings テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  key             TEXT        NOT NULL UNIQUE,
  value_encrypted TEXT        NOT NULL,  -- "iv:authTag:ciphertext" (AES-256-GCM)
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  settings                IS 'アプリ全体の設定（暗号化して保存）';
COMMENT ON COLUMN settings.key            IS '設定キー名（一意）';
COMMENT ON COLUMN settings.value_encrypted IS '設定値を暗号化した文字列';

-- updated_at を自動更新するトリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_settings_updated_at ON settings;
CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
