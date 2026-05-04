// ============================================================
// vResolve Backend API v2 — server.js
// Node.js + Express + PostgreSQL + JWT
// ============================================================

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { Pool } = require('pg');
const fetch    = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── DB ───────────────────────────────────────────────────────
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
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ── Auth Middleware ──────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function mkInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Health ───────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

// ════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password min 6 characters' });
  try {
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 12);
    const ini  = mkInitials(name);
    const { rows } = await pool.query(
      `INSERT INTO users (name,email,password_hash,bio,initials)
       VALUES ($1,$2,$3,'',$4)
       RETURNING id,name,email,bio,initials,avatar,created_at`,
      [name, email, hash, ini]
    );
    const token = jwt.sign({ id: rows[0].id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'All fields required' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    const { password_hash, ...user } = rows[0];
    const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id,name,email,bio,initials,avatar,created_at FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.put('/api/auth/me', auth, async (req, res) => {
  const { name, bio, avatar } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const ini = mkInitials(name);
    const { rows } = await pool.query(
      `UPDATE users SET name=$1,bio=$2,initials=$3,avatar=$4
       WHERE id=$5
       RETURNING id,name,email,bio,initials,avatar`,
      [name, bio || '', ini, avatar || '', req.user.id]
    );
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Update failed' }); }
});

// ════════════════════════════════════════════════════════════
// FEED POSTS
// ════════════════════════════════════════════════════════════

app.get('/api/posts', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        fp.id, fp.body, fp.img_url, fp.likes, fp.created_at,
        fp.author_id, u.name AS author, u.initials, u.bio, u.avatar,
        EXISTS(
          SELECT 1 FROM feed_post_likes fpl
          WHERE fpl.post_id=fp.id AND fpl.user_id=$1
        ) AS liked,
        (SELECT COUNT(*) FROM feed_comments fc WHERE fc.post_id=fp.id) AS comment_count
      FROM feed_posts fp
      JOIN users u ON fp.author_id=u.id
      ORDER BY fp.created_at DESC
      LIMIT 50
    `, [req.user.id]);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.post('/api/posts', auth, async (req, res) => {
  const { body, img_url } = req.body;
  if (!body && !img_url) return res.status(400).json({ error: 'Post cannot be empty' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO feed_posts (author_id,body,img_url)
       VALUES ($1,$2,$3) RETURNING *`,
      [req.user.id, body || '', img_url || '']
    );
    const user = await pool.query(
      'SELECT name,initials,bio,avatar FROM users WHERE id=$1', [req.user.id]
    );
    res.status(201).json({ ...rows[0], ...user.rows[0], liked: false, comment_count: 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Delete feed post (own posts only)
app.delete('/api/posts/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT author_id FROM feed_posts WHERE id=$1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    if (rows[0].author_id !== req.user.id)
      return res.status(403).json({ error: 'Not your post' });
    await pool.query('DELETE FROM feed_posts WHERE id=$1', [req.params.id]);
    res.json({ deleted: true });
  } catch { res.status(500).json({ error: 'Delete failed' }); }
});

// Toggle like
app.post('/api/posts/:id/like', auth, async (req, res) => {
  const { id } = req.params;
  const uid = req.user.id;
  try {
    const exists = await pool.query(
      'SELECT 1 FROM feed_post_likes WHERE post_id=$1 AND user_id=$2', [id, uid]
    );
    if (exists.rows.length) {
      await pool.query('DELETE FROM feed_post_likes WHERE post_id=$1 AND user_id=$2', [id, uid]);
      await pool.query('UPDATE feed_posts SET likes=likes-1 WHERE id=$1', [id]);
      res.json({ liked: false });
    } else {
      await pool.query('INSERT INTO feed_post_likes (post_id,user_id) VALUES ($1,$2)', [id, uid]);
      await pool.query('UPDATE feed_posts SET likes=likes+1 WHERE id=$1', [id]);
      res.json({ liked: true });
    }
  } catch { res.status(500).json({ error: 'Like failed' }); }
});

// ════════════════════════════════════════════════════════════
// FEED COMMENTS
// ════════════════════════════════════════════════════════════

app.get('/api/posts/:id/comments', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT fc.id, fc.body, fc.created_at,
             u.id AS author_id, u.name AS author, u.initials, u.avatar
      FROM feed_comments fc
      JOIN users u ON fc.author_id=u.id
      WHERE fc.post_id=$1
      ORDER BY fc.created_at ASC
    `, [req.params.id]);
    res.json(rows);
  } catch { res.status(500).json({ error: 'Failed to fetch comments' }); }
});

app.post('/api/posts/:id/comments', auth, async (req, res) => {
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO feed_comments (post_id,author_id,body)
       VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, req.user.id, body.trim()]
    );
    const user = await pool.query(
      'SELECT name,initials,avatar FROM users WHERE id=$1', [req.user.id]
    );
    res.status(201).json({ ...rows[0], ...user.rows[0] });
  } catch { res.status(500).json({ error: 'Comment failed' }); }
});

app.delete('/api/posts/:postId/comments/:commentId', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT author_id FROM feed_comments WHERE id=$1', [req.params.commentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Comment not found' });
    if (rows[0].author_id !== req.user.id)
      return res.status(403).json({ error: 'Not your comment' });
    await pool.query('DELETE FROM feed_comments WHERE id=$1', [req.params.commentId]);
    res.json({ deleted: true });
  } catch { res.status(500).json({ error: 'Delete failed' }); }
});

// ════════════════════════════════════════════════════════════
// VAULT POSTS
// ════════════════════════════════════════════════════════════

app.get('/api/vault', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT vp.id, vp.body, vp.ai_reply, vp.thinking, vp.created_at,
             (SELECT COUNT(*) FROM vault_comments vc WHERE vc.post_id=vp.id) AS comment_count
      FROM vault_posts vp
      ORDER BY vp.created_at DESC LIMIT 50
    `);
    res.json(rows);
  } catch { res.status(500).json({ error: 'Failed to fetch vault' }); }
});

app.post('/api/vault', auth, async (req, res) => {
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'Post cannot be empty' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO vault_posts (body,ai_reply,thinking)
       VALUES ($1,'',TRUE) RETURNING *`,
      [body]
    );
    res.status(201).json(rows[0]);
    // Fire AI in background
    getAIReply(body).then(reply =>
      pool.query('UPDATE vault_posts SET ai_reply=$1,thinking=FALSE WHERE id=$2', [reply, rows[0].id])
    ).catch(console.error);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/vault/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id,body,ai_reply,thinking,created_at FROM vault_posts WHERE id=$1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// Delete vault post (any authenticated user — since vault is anonymous)
app.delete('/api/vault/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id FROM vault_posts WHERE id=$1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    await pool.query('DELETE FROM vault_posts WHERE id=$1', [req.params.id]);
    res.json({ deleted: true });
  } catch { res.status(500).json({ error: 'Delete failed' }); }
});

// ════════════════════════════════════════════════════════════
// VAULT COMMENTS
// ════════════════════════════════════════════════════════════

app.get('/api/vault/:id/comments', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT vc.id, vc.body, vc.created_at,
             u.id AS author_id, u.name AS author, u.initials, u.avatar
      FROM vault_comments vc
      JOIN users u ON vc.author_id=u.id
      WHERE vc.post_id=$1
      ORDER BY vc.created_at ASC
    `, [req.params.id]);
    res.json(rows);
  } catch { res.status(500).json({ error: 'Failed to fetch comments' }); }
});

app.post('/api/vault/:id/comments', auth, async (req, res) => {
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO vault_comments (post_id,author_id,body)
       VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, req.user.id, body.trim()]
    );
    const user = await pool.query(
      'SELECT name,initials,avatar FROM users WHERE id=$1', [req.user.id]
    );
    res.status(201).json({ ...rows[0], ...user.rows[0] });
  } catch { res.status(500).json({ error: 'Comment failed' }); }
});

app.delete('/api/vault/:postId/comments/:commentId', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT author_id FROM vault_comments WHERE id=$1', [req.params.commentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Comment not found' });
    if (rows[0].author_id !== req.user.id)
      return res.status(403).json({ error: 'Not your comment' });
    await pool.query('DELETE FROM vault_comments WHERE id=$1', [req.params.commentId]);
    res.json({ deleted: true });
  } catch { res.status(500).json({ error: 'Delete failed' }); }
});

// ════════════════════════════════════════════════════════════
// WELLNESS
// ════════════════════════════════════════════════════════════

app.get('/api/wellness', auth, async (req, res) => {
  try {
    const weekly = await pool.query(
      `SELECT date,cal_consumed,cal_goal FROM wellness
       WHERE user_id=$1 AND date>=CURRENT_DATE-INTERVAL '6 days'
       ORDER BY date ASC`,
      [req.user.id]
    );
    const today = await pool.query(
      'SELECT * FROM wellness WHERE user_id=$1 AND date=CURRENT_DATE',
      [req.user.id]
    );
    res.json({ weekly: weekly.rows, today: today.rows[0] || null });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/wellness/calories', auth, async (req, res) => {
  const { cal_consumed, cal_goal } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO wellness (user_id,date,cal_consumed,cal_goal)
       VALUES ($1,CURRENT_DATE,$2,$3)
       ON CONFLICT (user_id,date)
       DO UPDATE SET cal_consumed=$2,cal_goal=$3,updated_at=NOW()
       RETURNING *`,
      [req.user.id, cal_consumed, cal_goal || 2000]
    );
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ════════════════════════════════════════════════════════════
// GEMINI AI
// ════════════════════════════════════════════════════════════

async function getAIReply(msg) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `You are a compassionate AI wellness guide. Respond with wisdom from the Bhagavad Gita, referencing specific chapters and verses. Be empathetic and practical. Keep response under 120 words.\n\nUser shares: ${msg}` }] }]
        })
      }
    );
    const d = await res.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text
      || 'The Gita teaches us to face all challenges with equanimity. (Chapter 2, Verse 48)';
  } catch {
    const fb = [
      'Chapter 6, Verse 5: Lift yourself by your own efforts. You have the strength within you.',
      'Chapter 2, Verse 14: Pain and pleasure are transient — endure them with patience.',
      'Chapter 3, Verse 19: Without attachment, perform the work that has to be done.',
    ];
    return fb[Math.floor(Math.random() * fb.length)];
  }
}

app.listen(PORT, () => console.log(`🚀 vResolve API running on port ${PORT}`));