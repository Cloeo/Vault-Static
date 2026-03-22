const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const Database = require('better-sqlite3');
const SQLiteStore = require('better-sqlite3-session-store')(session);

const app = express();
const db = new Database('vault.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.use(session({
  store: new SQLiteStore({ client: db, expired: { clear: true, intervalMs: 900000 } }),
  secret: process.env.SESSION_SECRET || 'vnd_secret_key_change_in_prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    return res.status(400).json({ error: 'username must be at least 2 characters', field: 'username' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters', field: 'password' });
  }

  const clean = username.trim().slice(0, 32);
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(clean);

  if (existing) {
    return res.status(409).json({ error: 'that username is already taken', field: 'username' });
  }

  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(clean, hash);

  req.session.userId = result.lastInsertRowid;
  req.session.username = clean;

  return res.json({ ok: true, username: clean });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'missing fields' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());

  if (!user) {
    return res.status(401).json({ error: 'username is wrong', field: 'username' });
  }

  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    return res.status(401).json({ error: 'password is wrong', field: 'password' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;

  return res.json({ ok: true, username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'not logged in' });
  }
  return res.json({ userId: req.session.userId, username: req.session.username });
});

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/accountauth');
  }
  next();
}

app.get('/accountauth', (req, res) => {
  res.sendFile(path.join(__dirname, 'accountauth.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT);
