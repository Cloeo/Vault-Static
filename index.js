const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const Database = require('better-sqlite3');
const SQLiteStore = require('better-sqlite3-session-store')(session);
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const db = new Database('vault.db');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    slug TEXT UNIQUE NOT NULL,
    is_private INTEGER DEFAULT 0,
    password TEXT DEFAULT NULL,
    is_downloadable INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS project_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    size INTEGER DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );
`);

app.set('trust proxy', 1);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname))
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.use(session({
  store: new SQLiteStore({ client: db, expired: { clear: true, intervalMs: 900000 } }),
  secret: process.env.SESSION_SECRET || 'vnd_fallback_secret_32chars_xyzabc',
  resave: true,
  saveUninitialized: false,
  name: 'vnd.sid',
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.redirect('/accountauth');
  next();
}

function requireAuthAPI(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'not logged in' });
  next();
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function generateSlug() {
  return crypto.randomBytes(6).toString('hex');
}

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || username.trim().length < 2)
    return res.status(400).json({ error: 'username must be at least 2 characters', field: 'username' });
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'password must be at least 6 characters', field: 'password' });

  const clean = username.trim().slice(0, 32);
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(clean);
  if (existing) return res.status(409).json({ error: 'that username is already taken', field: 'username' });

  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(clean, hash);

  req.session.userId = result.lastInsertRowid;
  req.session.username = clean;

  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'session error' });
    return res.json({ ok: true, username: clean });
  });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'missing fields' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user) return res.status(401).json({ error: 'username is wrong', field: 'username' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'password is wrong', field: 'password' });

  req.session.userId = user.id;
  req.session.username = user.username;

  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'session error' });
    return res.json({ ok: true, username: user.username });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'not logged in' });
  return res.json({ userId: req.session.userId, username: req.session.username });
});

app.post('/api/projects', requireAuthAPI, upload.array('files', 100), async (req, res) => {
  const { title, description, is_private, is_downloadable, password } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'at least one file required' });

  const isPrivate = is_private === '1';
  const isDownloadable = is_downloadable === '1';
  let hashedPw = null;

  if (isPrivate && password) hashedPw = await bcrypt.hash(password, 10);

  let slug = generateSlug();
  while (db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug)) slug = generateSlug();

  const proj = db.prepare(
    'INSERT INTO projects (user_id, title, description, slug, is_private, password, is_downloadable) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.session.userId, title.slice(0, 120), (description || '').slice(0, 500), slug, isPrivate ? 1 : 0, hashedPw, isDownloadable ? 1 : 0);

  const insertFile = db.prepare('INSERT INTO project_files (project_id, original_name, stored_name, size) VALUES (?, ?, ?, ?)');
  req.files.forEach(f => insertFile.run(proj.lastInsertRowid, f.originalname, f.filename, f.size));

  return res.json({ ok: true, slug });
});

app.get('/api/projects/mine', requireAuthAPI, (req, res) => {
  const projects = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC').all(req.session.userId);
  const result = projects.map(p => {
    const count = db.prepare('SELECT COUNT(*) as c FROM project_files WHERE project_id = ?').get(p.id);
    return {
      id: p.id, title: p.title, description: p.description, slug: p.slug,
      is_private: !!p.is_private, is_downloadable: !!p.is_downloadable,
      file_count: count.c, created_at: p.created_at
    };
  });
  return res.json(result);
});

app.get('/api/projects/public', (req, res) => {
  const projects = db.prepare(
    'SELECT p.*, u.username as owner FROM projects p JOIN users u ON p.user_id = u.id WHERE p.is_private = 0 ORDER BY p.created_at DESC LIMIT 50'
  ).all();
  const result = projects.map(p => {
    const count = db.prepare('SELECT COUNT(*) as c FROM project_files WHERE project_id = ?').get(p.id);
    return {
      id: p.id, title: p.title, description: p.description, slug: p.slug,
      owner: p.owner, is_downloadable: !!p.is_downloadable, file_count: count.c
    };
  });
  return res.json(result);
});

app.get('/api/projects/:slug', async (req, res) => {
  const proj = db.prepare(
    'SELECT p.*, u.username as owner FROM projects p JOIN users u ON p.user_id = u.id WHERE p.slug = ?'
  ).get(req.params.slug);

  if (!proj) return res.status(404).json({ error: 'not found' });

  if (proj.is_private) {
    const isOwner = req.session.userId && Number(req.session.userId) === Number(proj.user_id);
    if (!isOwner) {
      const pw = req.query.password;
      if (!pw) return res.json({ locked: true });
      const match = await bcrypt.compare(pw, proj.password);
      if (!match) return res.status(401).json({ locked: true, error: 'wrong password' });
    }
  }

  const files = db.prepare('SELECT * FROM project_files WHERE project_id = ?').all(proj.id);
  return res.json({
    title: proj.title, description: proj.description, owner: proj.owner,
    is_downloadable: !!proj.is_downloadable, slug: proj.slug,
    files: files.map(f => ({ id: f.id, name: f.original_name, size_label: formatBytes(f.size) }))
  });
});

app.get('/api/projects/:slug/download/:fileId', async (req, res) => {
  const proj = db.prepare('SELECT * FROM projects WHERE slug = ?').get(req.params.slug);
  if (!proj || !proj.is_downloadable) return res.status(403).json({ error: 'not allowed' });

  if (proj.is_private) {
    const isOwner = req.session.userId && Number(req.session.userId) === Number(proj.user_id);
    if (!isOwner) return res.status(401).json({ error: 'unauthorized' });
  }

  const file = db.prepare('SELECT * FROM project_files WHERE id = ? AND project_id = ?').get(req.params.fileId, proj.id);
  if (!file) return res.status(404).json({ error: 'file not found' });

  const filePath = path.join(UPLOADS_DIR, file.stored_name);
  res.download(filePath, file.original_name);
});

app.get('/accountauth', (req, res) => res.sendFile(path.join(__dirname, 'accountauth.html')));
app.get('/projectstorage', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'projectstorage.html')));
app.get('/p/:slug', (req, res) => res.sendFile(path.join(__dirname, 'project-view.html')));
app.get('/dashboard', (req, res) => res.redirect('/projectstorage'));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT);
