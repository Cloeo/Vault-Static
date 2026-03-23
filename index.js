const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const db = new Database('vault.db');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS admin_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_username TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    session_token TEXT DEFAULT NULL,
    used INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
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
    instant_download INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    last_accessed INTEGER DEFAULT (strftime('%s','now')),
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS project_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT DEFAULT 'application/octet-stream',
    size INTEGER DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );
  CREATE TABLE IF NOT EXISTS project_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    UNIQUE(project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS project_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

try { db.exec(`ALTER TABLE projects ADD COLUMN last_accessed INTEGER DEFAULT (strftime('%s','now'));`); } catch(e) {}
try { db.exec(`ALTER TABLE projects ADD COLUMN views INTEGER DEFAULT 0;`); } catch(e) {}
try { db.exec(`ALTER TABLE projects ADD COLUMN instant_download INTEGER DEFAULT 0;`); } catch(e) {}
try { db.exec(`ALTER TABLE project_files ADD COLUMN mime_type TEXT DEFAULT 'application/octet-stream';`); } catch(e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0;`); } catch(e) {}

app.set('trust proxy', 1);

app.use((req, res, next) => { res.setTimeout(0); req.setTimeout(0); next(); });
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: '.' }),
  secret: process.env.SESSION_SECRET || 'vnd_secret_key_x9k2m4p7',
  resave: false,
  saveUninitialized: false,
  name: 'vnd.sid',
  cookie: { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 }
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: Infinity, fieldSize: Infinity, files: 100 } });

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function generateSlug() { return crypto.randomBytes(6).toString('hex'); }

function generateAdminCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 9; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return 'vaultndrop-' + code;
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.txt':'text/plain','.md':'text/plain','.js':'text/plain','.ts':'text/plain',
    '.json':'application/json','.html':'text/plain','.css':'text/plain','.py':'text/plain',
    '.sh':'text/plain','.log':'text/plain','.csv':'text/plain','.xml':'text/plain',
    '.yml':'text/plain','.yaml':'text/plain','.env':'text/plain',
    '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif',
    '.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.webm':'video/webm',
    '.mp3':'audio/mpeg','.pdf':'application/pdf','.zip':'application/zip',
    '.tar':'application/x-tar','.gz':'application/gzip',
    '.safetensors':'application/octet-stream','.ckpt':'application/octet-stream',
    '.pt':'application/octet-stream','.bin':'application/octet-stream'
  };
  return map[ext] || 'application/octet-stream';
}

function isTextFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.txt','.md','.js','.ts','.json','.html','.css','.py','.sh','.log','.csv','.xml','.yml','.yaml','.env','.cfg','.ini','.rs','.go','.c','.cpp','.h','.java','.rb','.php','.swift','.kt'].includes(ext);
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.redirect('/accountauth');
  next();
}

function requireAuthAPI(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'not logged in' });
  next();
}

function requireAdminAPI(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.status(401).json({ error: 'no token' });
  const record = db.prepare('SELECT * FROM admin_tokens WHERE session_token = ? AND used = 1').get(token);
  if (!record) return res.status(401).json({ error: 'invalid token' });
  req.adminUsername = record.website_username;
  next();
}

function deleteProject(projectId) {
  const files = db.prepare('SELECT stored_name FROM project_files WHERE project_id = ?').all(projectId);
  files.forEach(f => { try { const fp = path.join(UPLOADS_DIR, f.stored_name); if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch(e) {} });
  db.prepare('DELETE FROM project_files WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM project_likes WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM project_comments WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
}

function runCleanup() {
  const cutoff = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
  db.prepare('SELECT id FROM projects WHERE last_accessed < ?').all(cutoff).forEach(p => deleteProject(p.id));
}

setInterval(runCleanup, 1000 * 60 * 60 * 6);
runCleanup();

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || username.trim().length < 2) return res.status(400).json({ error: 'username must be at least 2 characters', field: 'username' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters', field: 'password' });
    const clean = username.trim().slice(0, 32);
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(clean)) return res.status(409).json({ error: 'that username is already taken', field: 'username' });
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(clean, hash);
    req.session.userId = result.lastInsertRowid;
    req.session.username = clean;
    req.session.save(err => { if (err) return res.status(500).json({ error: 'session save failed' }); return res.json({ ok: true, username: clean }); });
  } catch(e) { return res.status(500).json({ error: 'server error' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'missing fields' });
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
    if (!user) return res.status(401).json({ error: 'username is wrong', field: 'username' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'password is wrong', field: 'password' });
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.save(err => { if (err) return res.status(500).json({ error: 'session save failed' }); return res.json({ ok: true, username: user.username }); });
  } catch(e) { return res.status(500).json({ error: 'server error' }); }
});

app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

app.get('/api/me', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'not logged in' });
  return res.json({ userId: req.session.userId, username: req.session.username });
});

app.post('/api/admin/auth', async (req, res) => {
  try {
    const { code, username } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });
    const record = db.prepare('SELECT * FROM admin_tokens WHERE code = ?').get(code.trim());
    if (!record) return res.status(401).json({ error: 'invalid auth code' });
    if (username && record.website_username.toLowerCase() !== username.toLowerCase()) return res.status(401).json({ error: 'username does not match this code' });
    const sessionToken = crypto.randomBytes(32).toString('hex');
    db.prepare('UPDATE admin_tokens SET session_token = ?, used = 1 WHERE id = ?').run(sessionToken, record.id);
    return res.json({ ok: true, token: sessionToken, username: record.website_username });
  } catch(e) { return res.status(500).json({ error: 'server error' }); }
});

app.get('/api/admin/verify', requireAdminAPI, (req, res) => {
  return res.json({ ok: true, username: req.adminUsername });
});

app.get('/api/admin/users', requireAdminAPI, (req, res) => {
  const users = db.prepare('SELECT id, username, is_admin, created_at FROM users ORDER BY created_at DESC').all();
  return res.json(users.map(u => {
    const count = db.prepare('SELECT COUNT(*) as c FROM projects WHERE user_id = ?').get(u.id);
    return { ...u, project_count: count.c };
  }));
});

app.delete('/api/admin/users/:id', requireAdminAPI, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'not found' });
    const projects = db.prepare('SELECT id FROM projects WHERE user_id = ?').all(user.id);
    projects.forEach(p => deleteProject(p.id));
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    return res.json({ ok: true });
  } catch(e) { return res.status(500).json({ error: 'server error' }); }
});

app.get('/api/admin/projects', requireAdminAPI, (req, res) => {
  const projects = db.prepare('SELECT p.*, u.username as owner FROM projects p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC').all();
  return res.json(projects.map(p => ({ id: p.id, title: p.title, slug: p.slug, owner: p.owner, is_private: !!p.is_private, views: p.views || 0 })));
});

app.delete('/api/admin/projects/:slug', requireAdminAPI, (req, res) => {
  try {
    const proj = db.prepare('SELECT * FROM projects WHERE slug = ?').get(req.params.slug);
    if (!proj) return res.status(404).json({ error: 'not found' });
    deleteProject(proj.id);
    return res.json({ ok: true });
  } catch(e) { return res.status(500).json({ error: 'server error' }); }
});

app.get('/api/admin/tokens', requireAdminAPI, (req, res) => {
  return res.json(db.prepare('SELECT * FROM admin_tokens ORDER BY created_at DESC').all());
});

app.delete('/api/admin/tokens/:id', requireAdminAPI, (req, res) => {
  db.prepare('DELETE FROM admin_tokens WHERE id = ?').run(req.params.id);
  return res.json({ ok: true });
});

app.post('/api/bot/create-admin-open', (req, res) => {
  try {
    const { website_username } = req.body;
    if (!website_username) return res.status(400).json({ error: 'website_username required' });
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(website_username.trim());
    if (!user) return res.status(404).json({ error: 'user not found on site' });
    return res.json({ ok: true, username: user.username });
  } catch(e) { return res.status(500).json({ error: 'server error' }); }
});

app.post('/api/bot/gift-code-open', (req, res) => {
  try {
    const { website_username } = req.body;
    if (!website_username) return res.status(400).json({ error: 'website_username required' });
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(website_username.trim());
    if (!user) return res.status(404).json({ error: 'user not found on site' });
    let code = generateAdminCode();
    while (db.prepare('SELECT id FROM admin_tokens WHERE code = ?').get(code)) code = generateAdminCode();
    db.prepare('INSERT INTO admin_tokens (website_username, code) VALUES (?, ?)').run(website_username.trim(), code);
    return res.json({ ok: true, code, username: website_username });
  } catch(e) { return res.status(500).json({ error: 'server error' }); }
});

app.post('/api/projects', requireAuthAPI, upload.array('files', 100), async (req, res) => {
  try {
    const { title, description, is_private, is_downloadable, instant_download, password } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'at least one file required' });
    const isPrivate = is_private === '1';
    let hashedPw = null;
    if (isPrivate && password) hashedPw = await bcrypt.hash(password, 10);
    let slug = generateSlug();
    while (db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug)) slug = generateSlug();
    const proj = db.prepare(
      'INSERT INTO projects (user_id, title, description, slug, is_private, password, is_downloadable, instant_download, last_accessed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.session.userId, title.slice(0, 120), (description || '').slice(0, 500), slug, isPrivate ? 1 : 0, hashedPw, is_downloadable === '1' ? 1 : 0, instant_download === '1' ? 1 : 0, Math.floor(Date.now() / 1000));
    const insertFile = db.prepare('INSERT INTO project_files (project_id, original_name, stored_name, mime_type, size) VALUES (?, ?, ?, ?, ?)');
    req.files.forEach(f => insertFile.run(proj.lastInsertRowid, f.originalname, f.filename, getMimeType(f.originalname), f.size));
    return res.json({ ok: true, slug });
  } catch(e) { return res.status(500).json({ error: 'server error' }); }
});

app.get('/api/projects/mine', requireAuthAPI, (req, res) => {
  const projects = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC').all(req.session.userId);
  return res.json(projects.map(p => {
    const count = db.prepare('SELECT COUNT(*) as c FROM project_files WHERE project_id = ?').get(p.id);
    const likeCount = db.prepare('SELECT COUNT(*) as c FROM project_likes WHERE project_id = ?').get(p.id);
    const commentCount = db.prepare('SELECT COUNT(*) as c FROM project_comments WHERE project_id = ?').get(p.id);
    return { id: p.id, title: p.title, description: p.description, slug: p.slug, is_private: !!p.is_private, is_downloadable: !!p.is_downloadable, instant_download: !!p.instant_download, file_count: count.c, views: p.views || 0, likes: likeCount.c, comments: commentCount.c };
  }));
});

app.get('/api/projects/public', (req, res) => {
  const projects = db.prepare('SELECT p.*, u.username as owner FROM projects p JOIN users u ON p.user_id = u.id WHERE p.is_private = 0 ORDER BY p.created_at DESC LIMIT 50').all();
  return res.json(projects.map(p => {
    const count = db.prepare('SELECT COUNT(*) as c FROM project_files WHERE project_id = ?').get(p.id);
    const likeCount = db.prepare('SELECT COUNT(*) as c FROM project_likes WHERE project_id = ?').get(p.id);
    const commentCount = db.prepare('SELECT COUNT(*) as c FROM project_comments WHERE project_id = ?').get(p.id);
    return { id: p.id, title: p.title, description: p.description, slug: p.slug, owner: p.owner, is_downloadable: !!p.is_downloadable, instant_download: !!p.instant_download, file_count: count.c, views: p.views || 0, likes: likeCount.c, comments: commentCount.c };
  }));
});

app.get('/api/projects/:slug', async (req, res) => {
  try {
    const proj = db.prepare('SELECT p.*, u.username as owner FROM projects p JOIN users u ON p.user_id = u.id WHERE p.slug = ?').get(req.params.slug);
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
    const isOwner = req.session.userId && Number(req.session.userId) === Number(proj.user_id);
    if (!isOwner) {
      db.prepare('UPDATE projects SET views = views + 1, last_accessed = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), proj.id);
    } else {
      db.prepare('UPDATE projects SET last_accessed = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), proj.id);
    }
    const likeCount = db.prepare('SELECT COUNT(*) as c FROM project_likes WHERE project_id = ?').get(proj.id);
    const commentCount = db.prepare('SELECT COUNT(*) as c FROM project_comments WHERE project_id = ?').get(proj.id);
    let userLiked = false;
    if (req.session.userId) userLiked = !!db.prepare('SELECT id FROM project_likes WHERE project_id = ? AND user_id = ?').get(proj.id, req.session.userId);
    const updatedProj = db.prepare('SELECT views FROM projects WHERE id = ?').get(proj.id);
    const files = db.prepare('SELECT * FROM project_files WHERE project_id = ?').all(proj.id);
    return res.json({
      title: proj.title, description: proj.description, owner: proj.owner,
      is_downloadable: !!proj.is_downloadable, instant_download: !!proj.instant_download,
      is_private: !!proj.is_private, slug: proj.slug,
      views: updatedProj.views || 0, likes: likeCount.c, comments: commentCount.c,
      user_liked: userLiked, is_owner: isOwner,
      files: files.map(f => ({ id: f.id, name: f.original_name, size_label: formatBytes(f.size), mime_type: f.mime_type || getMimeType(f.original_name), is_text: isTextFile(f.original_name) }))
    });
  } catch(e) { return res.status(500).json({ error: 'server error' }); }
});

app.post('/api/projects/:slug/like', requireAuthAPI, (req, res) => {
  try {
    const proj = db.prepare('SELECT * FROM projects WHERE slug = ? AND is_private = 0').get(req.params.slug);
    if (!proj) return res.status(404).json({ error: 'not found' });
    const existing = db.prepare('SELECT id FROM project_likes WHERE project_id = ? AND user_id = ?').get(proj.id, req.session.userId);
    if (existing) { db.prepare('DELETE FROM project_likes WHERE project_id = ? AND user_id = ?').run(proj.id, req.session.userId); }
    else { db.prepare('INSERT INTO project_likes (project_id, user_id) VALUES (?, ?)').run(proj.id, req.session.userId); }
    const count = db.prepare('SELECT COUNT(*) as c FROM project_likes WHERE project_id = ?').get(proj.id);
    return res.json({ ok: true, likes: count.c, liked: !existing });
  } catch(e) { return res.status(500).json({ error: 'server error' }); }
});

app.get('/api/projects/:slug/comments', (req, res) => {
  try {
    const proj = db.prepare('SELECT * FROM projects WHERE slug = ?').get(req.params.slug);
    if (!proj) return res.status(404).json({ error: 'not found' });
    return res.json(db.prepare('SELECT * FROM project_comments WHERE project_id = ? ORDER BY created_at ASC').all(proj.id).map(c => ({ id: c.id, username: c.username, body: c.body, created_at: c.created_at })));
  } catch(e) { return res.status(500).json({ error: 'server error' }); }
});

app.post('/api/projects/:slug/comments', requireAuthAPI, (req, res) => {
  try {
    const proj = db.prepare('SELECT * FROM projects WHERE slug = ? AND is_private = 0').get(req.params.slug);
    if (!proj) return res.status(404).json({ error: 'not found or private' });
    const body = (req.body.body || '').trim().slice(0, 500);
    if (!body) return res.status(400).json({ error: 'comment cannot be empty' });
    const result = db.prepare('INSERT INTO project_comments (project_id, user_id, username, body) VALUES (?, ?, ?, ?)').run(proj.id, req.session.userId, req.session.username, body);
    return res.json({ ok: true, id: result.lastInsertRowid, username: req.session.username, body, created_at: Math.floor(Date.now() / 1000) });
  } catch(e) { return res.status(500).json({ error: 'server error' }); }
});

app.get('/api/projects/:slug/file/:fileId/view', async (req, res) => {
  try {
    const proj = db.prepare('SELECT * FROM projects WHERE slug = ?').get(req.params.slug);
    if (!proj) return res.status(404).send('not found');
    if (proj.is_private) {
      const isOwner = req.session.userId && Number(req.session.userId) === Number(proj.user_id);
      if (!isOwner) {
        const pw = req.query.password;
        if (!pw) return res.status(401).send('unauthorized');
        const match = await bcrypt.compare(pw, proj.password);
        if (!match) return res.status(401).send('wrong password');
      }
    }
    const file = db.prepare('SELECT * FROM project_files WHERE id = ? AND project_id = ?').get(req.params.fileId, proj.id);
    if (!file) return res.status(404).send('file not found');
    const filePath = path.join(UPLOADS_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).send('file not found');
    res.setHeader('Content-Type', (file.mime_type || getMimeType(file.original_name)) + '; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(filePath).pipe(res);
  } catch(e) { return res.status(500).send('server error'); }
});

app.get('/api/projects/:slug/download/:fileId', async (req, res) => {
  try {
    const proj = db.prepare('SELECT * FROM projects WHERE slug = ?').get(req.params.slug);
    if (!proj) return res.status(404).json({ error: 'not found' });
    if (!proj.is_downloadable && !proj.instant_download) return res.status(403).json({ error: 'not allowed' });
    if (proj.is_private) {
      const isOwner = req.session.userId && Number(req.session.userId) === Number(proj.user_id);
      if (!isOwner) {
        const pw = req.query.password;
        if (!pw) return res.status(401).json({ error: 'unauthorized' });
        const match = await bcrypt.compare(pw, proj.password);
        if (!match) return res.status(401).json({ error: 'wrong password' });
      }
    }
    const file = db.prepare('SELECT * FROM project_files WHERE id = ? AND project_id = ?').get(req.params.fileId, proj.id);
    if (!file) return res.status(404).json({ error: 'file not found' });
    const filePath = path.join(UPLOADS_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file missing from disk' });
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(file.original_name) + '"');
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      res.status(206);
      res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + fileSize);
      res.setHeader('Content-Length', end - start + 1);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', fileSize);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch(e) { return res.status(500).json({ error: 'server error' }); }
});

app.delete('/api/projects/:slug', requireAuthAPI, (req, res) => {
  try {
    const proj = db.prepare('SELECT * FROM projects WHERE slug = ? AND user_id = ?').get(req.params.slug, req.session.userId);
    if (!proj) return res.status(404).json({ error: 'not found or not yours' });
    deleteProject(proj.id);
    return res.json({ ok: true });
  } catch(e) { return res.status(500).json({ error: 'server error' }); }
});

app.get('/accountauth', (req, res) => res.sendFile(path.join(__dirname, 'accountauth.html')));
app.get('/projectstorage', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'projectstorage.html')));
app.get('/adminpanel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/p/:slug', (req, res) => res.sendFile(path.join(__dirname, 'project-view.html')));
app.get('/dashboard', (req, res) => res.redirect('/projectstorage'));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const server = app.listen(process.env.PORT || 3000, () => console.log('running on port ' + (process.env.PORT || 3000)));
server.timeout = 0;
server.keepAliveTimeout = 0;
