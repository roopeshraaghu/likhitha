// ============================================================
// vResolve Backend API — server.js
// Node.js + Express + PostgreSQL + JWT
// ============================================================

require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const { Pool }    = require('pg');
const fetch       = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── DB Connection ────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'vresolve',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.connect()
  .then(() => console.log('✅ PostgreSQL connected'))
  .catch(err => console.error('❌ DB connection failed:', err.message));

// ── Middleware ───────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '5mb' })); // allow base64 image posts
app.use(express.static('public'));       // serve frontend from /public

// ── Auth Middleware ──────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function makeInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── HEALTH CHECK ─────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

// ════════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════════

// Register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const initials = makeInitials(name);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, bio, initials)
       VALUES ($1,$2,$3,'',$4) RETURNING id, name, email, bio, initials, avatar_url, created_at`,
      [name, email, hash, initials]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'All fields required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user profile
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, bio, initials, avatar_url, created_at FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update profile
app.put('/api/auth/me', authMiddleware, async (req, res) => {
  const { name, bio } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const initials = makeInitials(name);
    const result = await pool.query(
      `UPDATE users SET name=$1, bio=$2, initials=$3
       WHERE id=$4 RETURNING id, name, email, bio, initials, avatar_url`,
      [name, bio || '', initials, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Profile update failed' });
  }
});

// ════════════════════════════════════════════════════════════
// FEED POSTS
// ════════════════════════════════════════════════════════════

// Get all feed posts
app.get('/api/posts', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        fp.id, fp.body, fp.img_url, fp.likes, fp.created_at,
        u.name AS author, u.initials, u.bio, u.avatar_url,
        EXISTS (
          SELECT 1 FROM feed_post_likes fpl
          WHERE fpl.post_id = fp.id AND fpl.user_id = $1
        ) AS liked
      FROM feed_posts fp
      JOIN users u ON fp.author_id = u.id
      ORDER BY fp.created_at DESC
      LIMIT 50
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Create feed post
app.post('/api/posts', authMiddleware, async (req, res) => {
  const { body, img_url } = req.body;
  if (!body && !img_url) return res.status(400).json({ error: 'Post cannot be empty' });
  try {
    const result = await pool.query(
      `INSERT INTO feed_posts (author_id, body, img_url)
       VALUES ($1,$2,$3)
       RETURNING id, body, img_url, likes, created_at`,
      [req.user.id, body || '', img_url || '']
    );
    const post = result.rows[0];
    // attach author info
    const user = await pool.query(
      'SELECT name, initials, bio, avatar_url FROM users WHERE id=$1', [req.user.id]
    );
    res.status(201).json({ ...post, ...user.rows[0], liked: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Toggle like
app.post('/api/posts/:id/like', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const uid = req.user.id;
  try {
    const existing = await pool.query(
      'SELECT 1 FROM feed_post_likes WHERE post_id=$1 AND user_id=$2', [id, uid]
    );
    if (existing.rows.length) {
      await pool.query('DELETE FROM feed_post_likes WHERE post_id=$1 AND user_id=$2', [id, uid]);
      await pool.query('UPDATE feed_posts SET likes = likes - 1 WHERE id=$1', [id]);
      res.json({ liked: false });
    } else {
      await pool.query('INSERT INTO feed_post_likes (post_id, user_id) VALUES ($1,$2)', [id, uid]);
      await pool.query('UPDATE feed_posts SET likes = likes + 1 WHERE id=$1', [id]);
      res.json({ liked: true });
    }
  } catch (err) {
    res.status(500).json({ error: 'Like failed' });
  }
});

// ════════════════════════════════════════════════════════════
// VAULT POSTS
// ════════════════════════════════════════════════════════════

// Get vault posts
app.get('/api/vault', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, body, ai_reply, thinking, created_at FROM vault_posts ORDER BY created_at DESC LIMIT 50'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vault posts' });
  }
});

// Create vault post + trigger AI
app.post('/api/vault', authMiddleware, async (req, res) => {
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'Post cannot be empty' });
  try {
    // Insert with thinking=true
    const result = await pool.query(
      `INSERT INTO vault_posts (body, ai_reply, thinking)
       VALUES ($1, '', TRUE) RETURNING *`,
      [body]
    );
    const post = result.rows[0];
    res.status(201).json(post);

    // Fire AI in background
    getAIReply(body).then(async reply => {
      await pool.query(
        'UPDATE vault_posts SET ai_reply=$1, thinking=FALSE WHERE id=$2',
        [reply, post.id]
      );
    }).catch(console.error);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create vault post' });
  }
});

// Poll vault post for AI reply
app.get('/api/vault/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, body, ai_reply, thinking, created_at FROM vault_posts WHERE id=$1',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vault post' });
  }
});

// ════════════════════════════════════════════════════════════
// WELLNESS
// ════════════════════════════════════════════════════════════

// Get wellness data (last 7 days)
app.get('/api/wellness', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT date, cal_consumed, cal_goal FROM wellness
       WHERE user_id=$1 AND date >= CURRENT_DATE - INTERVAL '6 days'
       ORDER BY date ASC`,
      [req.user.id]
    );
    // Get today's record
    const today = await pool.query(
      `SELECT * FROM wellness WHERE user_id=$1 AND date=CURRENT_DATE`,
      [req.user.id]
    );
    res.json({ weekly: result.rows, today: today.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch wellness data' });
  }
});

// Update today's calories
app.post('/api/wellness/calories', authMiddleware, async (req, res) => {
  const { cal_consumed, cal_goal } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO wellness (user_id, date, cal_consumed, cal_goal)
       VALUES ($1, CURRENT_DATE, $2, $3)
       ON CONFLICT (user_id, date)
       DO UPDATE SET cal_consumed=$2, cal_goal=$3, updated_at=NOW()
       RETURNING *`,
      [req.user.id, cal_consumed, cal_goal || 2000]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update calories' });
  }
});

// ════════════════════════════════════════════════════════════
// GEMINI AI (server-side — key never exposed to browser)
// ════════════════════════════════════════════════════════════
async function getAIReply(msg) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a compassionate AI wellness guide. Respond to the following with wisdom from the Bhagavad Gita, referencing specific chapters and verses. Be empathetic and practical. Keep response under 120 words.\n\nUser shares: ${msg}`
            }]
          }]
        })
      }
    );
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text
      || 'The Gita teaches us to face all challenges with equanimity. (Chapter 2, Verse 48)';
  } catch {
    const fallback = [
      'As the Bhagavad Gita teaches in Chapter 6, Verse 5: Lift yourself by your own efforts. You have the strength within you.',
      'Lord Krishna says in Chapter 2, Verse 14: Pain and pleasure are transient — endure them with patience and equanimity.',
      'In Chapter 3, Verse 19: Without attachment, perform the work that has to be done. Each step forward is a victory.',
    ];
    return fallback[Math.floor(Math.random() * fallback.length)];
  }
}

// ── Start Server ─────────────────────────────────────────────
app.listen(PORT, () => console.log(`🚀 vResolve API running on port ${PORT}`));