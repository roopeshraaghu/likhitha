-- ============================================================
-- vResolve PostgreSQL Schema v2
-- Run on EC2 2 (Database Server)
-- ============================================================

CREATE DATABASE IF NOT EXISTS vresolve;
\c vresolve;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  bio           TEXT DEFAULT '',
  initials      VARCHAR(4) DEFAULT '',
  avatar        TEXT DEFAULT '',   -- base64 image string
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── FEED POSTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feed_posts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  img_url     TEXT DEFAULT '',
  likes       INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── FEED POST LIKES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feed_post_likes (
  post_id    UUID REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- ── FEED COMMENTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feed_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── VAULT POSTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vault_posts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  body        TEXT NOT NULL,
  ai_reply    TEXT DEFAULT '',
  thinking    BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── VAULT COMMENTS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vault_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID NOT NULL REFERENCES vault_posts(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── WELLNESS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wellness (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  cal_consumed INTEGER DEFAULT 0,
  cal_goal     INTEGER DEFAULT 2000,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_feed_posts_author     ON feed_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_feed_posts_created    ON feed_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_comments_post    ON feed_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_vault_posts_created   ON vault_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_comments_post   ON vault_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_wellness_user_date    ON wellness(user_id, date);

-- ── AUTO UPDATE updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at      ON users;
DROP TRIGGER IF EXISTS trg_feed_posts_updated_at ON feed_posts;
DROP TRIGGER IF EXISTS trg_wellness_updated_at   ON wellness;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_feed_posts_updated_at
  BEFORE UPDATE ON feed_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_wellness_updated_at
  BEFORE UPDATE ON wellness FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── SEED DATA ────────────────────────────────────────────────
INSERT INTO users (id, name, email, password_hash, bio, initials)
VALUES
  ('00000000-0000-0000-0000-000000000001','Arjun K','arjun@demo.com', crypt('demo1234',gen_salt('bf')),'Wellness Enthusiast','AK'),
  ('00000000-0000-0000-0000-000000000002','Priya M','priya@demo.com', crypt('demo1234',gen_salt('bf')),'Mindfulness Coach','PM')
ON CONFLICT DO NOTHING;

INSERT INTO feed_posts (author_id, body, likes) VALUES
  ('00000000-0000-0000-0000-000000000001','Sometimes the hardest part is just showing up 💪',12),
  ('00000000-0000-0000-0000-000000000002','Just completed my 30-day meditation streak! 🧘',7)
ON CONFLICT DO NOTHING;

INSERT INTO vault_posts (body, ai_reply, thinking) VALUES
  ('Feeling overwhelmed with work lately.',
   'As the Bhagavad Gita teaches in Chapter 2, Verse 47: focus on your duties, not the outcome.',
   FALSE)
ON CONFLICT DO NOTHING;