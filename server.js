const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcrypt');
const multer = require('multer');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const db = new Database('data.db');

db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, is_admin INTEGER DEFAULT 0, created_at INTEGER);
CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, slug TEXT UNIQUE, owner_id INTEGER, title TEXT, description TEXT, is_private INTEGER, password TEXT, is_downloadable INTEGER, instant_download INTEGER, roblox INTEGER, views INTEGER DEFAULT 0, created_at INTEGER);
CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT, size INTEGER, path TEXT, is_text INTEGER);
CREATE TABLE IF NOT EXISTS likes (id INTEGER PRIMARY KEY, project_id INTEGER, user_id INTEGER);
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY, project_id INTEGER, user_id INTEGER, body TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS admin_tokens (id INTEGER PRIMARY KEY, code TEXT UNIQUE, used INTEGER DEFAULT 0, website_username TEXT, created_at INTEGER);
`);

const addCol = (t, c, d) => { try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`); } catch(e){} };
addCol('projects', 'password', 'TEXT');
addCol('projects', 'is_downloadable', 'INTEGER DEFAULT 0');
addCol('projects', 'instant_download', 'INTEGER DEFAULT 0');
addCol('projects', 'roblox', 'INTEGER DEFAULT 0');
addCol('projects', 'views', 'INTEGER DEFAULT 0');
addCol('files', 'is_text', 'INTEGER DEFAULT 0');

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: '.' }),
  secret: 'vault-secret-key-secure',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });
const uploadHandler = upload.array('files');

const isAuth = (req, res, next) => req.session.userId ? next() : res.status(401).json({error: 'unauthorized'});
const isAdmin = (req, res, next) => req.session.isAdmin ? next() : res.status(403).json({error: 'forbidden'});
const generateSlug = () => Math.random().toString(36).substring(2, 10);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/accountauth', (req, res) => res.sendFile(path.join(__dirname, 'public/auth.html')));
app.get('/projectstorage', (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));
app.get('/adminpanel', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/p/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public/project-view.html')));

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || password.length < 6) return res.status(400).json({error: 'invalid input'});
  try {
    const hash = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)');
    const info = stmt.run(username, hash, Math.floor(Date.now()/1000));
    req.session.userId = info.lastInsertRowid;
    res.json({ok: true});
  } catch (e) { res.status(400).json({error: 'username taken', field: 'username'}); }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(400).json({error: 'user not found', field: 'username'});
  try {
    const match = await bcrypt.compare(password, user.password || '');
    if (!match) return res.status(400).json({error: 'wrong password', field: 'password'});
    req.session.userId = user.id;
    if (user.is_admin) req.session.isAdmin = true;
    res.json({ok: true});
  } catch(e) { res.status(400).json({error: 'auth error'}); }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ok: true});
});

app.get('/api/me', isAuth, (req, res) => {
  const user = db.prepare('SELECT username, is_admin FROM users WHERE id = ?').get(req.session.userId);
  res.json(user);
});

app.post('/api/admin/auth', async (req, res) => {
  const { code, username } = req.body;
  const token = db.prepare('SELECT * FROM admin_tokens WHERE code = ? AND used = 0').get(code);
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username || req.session.userId);
  if (token || code === 'vaultndrop-admin') {
    if (token) db.prepare('UPDATE admin_tokens SET used = 1, website_username = ? WHERE id = ?').run(username, token.id);
    if (user) db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
    req.session.isAdmin = true;
    if (user) req.session.userId = user.id;
    res.json({ok: true, username: user ? user.username : 'admin'});
  } else { res.status(400).json({error: 'invalid code'}); }
});

app.get('/api/admin/verify', isAdmin, (req, res) => {
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.session.userId);
  res.json({ok: true, username: user ? user.username : 'admin'});
});

app.post('/api/projects', isAuth, (req, res) => {
  uploadHandler(req, res, async (err) => {
    if (err) return res.status(400).json({error: err.message});
    try {
      const { title, description, is_private, password, is_downloadable, instant_download, roblox } = req.body;
      const slug = generateSlug();
      const hash = password ? await bcrypt.hash(password, 10) : '';
      const stmt = db.prepare('INSERT INTO projects (slug, owner_id, title, description, is_private, password, is_downloadable, instant_download, roblox, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const info = stmt.run(slug, req.session.userId, title, description, is_private === '1' ? 1 : 0, hash, is_downloadable === '1' ? 1 : 0, instant_download === '1' ? 1 : 0, roblox === '1' ? 1 : 0, Math.floor(Date.now()/1000));
      
      const fileStmt = db.prepare('INSERT INTO files (project_id, name, size, path, is_text) VALUES (?, ?, ?, ?, ?)');
      if (req.files) {
        req.files.forEach(f => {
          const ext = path.extname(f.originalname).toLowerCase();
          const isText =['.txt','.md','.js','.ts','.json','.html','.css','.py','.sh','.log','.csv','.xml','.yml','.yaml','.env','.cfg','.ini','.rs','.go','.c','.cpp','.h','.java','.rb','.php','.swift','.kt','.lua'].includes(ext);
          fileStmt.run(info.lastInsertRowid, path.basename(f.originalname), f.size, path.basename(f.filename), isText ? 1 : 0);
        });
      }
      res.json({ok: true, slug});
    } catch(e) {
      res.status(500).json({error: 'upload failed'});
    }
  });
});

app.get('/api/projects/mine', isAuth, (req, res) => {
  const projects = db.prepare('SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at DESC').all(req.session.userId);
  projects.forEach(p => {
    delete p.password;
    p.file_count = db.prepare('SELECT COUNT(*) as c FROM files WHERE project_id = ?').get(p.id).c;
    p.likes = db.prepare('SELECT COUNT(*) as c FROM likes WHERE project_id = ?').get(p.id).c;
    p.comments = db.prepare('SELECT COUNT(*) as c FROM comments WHERE project_id = ?').get(p.id).c;
  });
  res.json(projects);
});

app.get('/api/projects/public', (req, res) => {
  const projects = db.prepare('SELECT p.*, u.username as owner FROM projects p JOIN users u ON p.owner_id = u.id WHERE is_private = 0 ORDER BY created_at DESC').all();
  projects.forEach(p => {
    delete p.password;
    p.file_count = db.prepare('SELECT COUNT(*) as c FROM files WHERE project_id = ?').get(p.id).c;
    p.likes = db.prepare('SELECT COUNT(*) as c FROM likes WHERE project_id = ?').get(p.id).c;
  });
  res.json(projects);
});

app.get('/api/projects/:slug', async (req, res) => {
  const p = db.prepare('SELECT p.*, u.username as owner FROM projects p JOIN users u ON p.owner_id = u.id WHERE slug = ?').get(req.params.slug);
  if (!p) return res.status(404).json({error: 'not found'});
  
  if (p.is_private && p.owner_id !== req.session.userId) {
    if (!p.password) return res.json({locked: true});
    try {
      const match = await bcrypt.compare(req.query.password || '', p.password);
      if (!match) return res.json({locked: true});
    } catch(e) { return res.json({locked: true}); }
  }
  
  delete p.password;
  db.prepare('UPDATE projects SET views = views + 1 WHERE id = ?').run(p.id);
  p.files = db.prepare('SELECT id, name, size, is_text FROM files WHERE project_id = ?').all(p.id);
  p.files.forEach(f => {
    if(f.size < 1024) f.size_label = f.size + ' B';
    else if(f.size < 1048576) f.size_label = (f.size/1024).toFixed(1) + ' KB';
    else f.size_label = (f.size/1048576).toFixed(1) + ' MB';
  });
  p.likes = db.prepare('SELECT COUNT(*) as c FROM likes WHERE project_id = ?').get(p.id).c;
  p.comments = db.prepare('SELECT COUNT(*) as c FROM comments WHERE project_id = ?').get(p.id).c;
  p.user_liked = req.session.userId ? !!db.prepare('SELECT 1 FROM likes WHERE project_id = ? AND user_id = ?').get(p.id, req.session.userId) : false;
  p.is_owner = p.owner_id === req.session.userId;
  res.json(p);
});

app.delete('/api/projects/:slug', isAuth, (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE slug = ?').get(req.params.slug);
  if (!p || (!req.session.isAdmin && p.owner_id !== req.session.userId)) return res.status(403).json({error: 'forbidden'});
  const files = db.prepare('SELECT path FROM files WHERE project_id = ?').all(p.id);
  files.forEach(f => { try { fs.unlinkSync(path.join('uploads', path.basename(f.path))); } catch(e){} });
  db.prepare('DELETE FROM files WHERE project_id = ?').run(p.id);
  db.prepare('DELETE FROM comments WHERE project_id = ?').run(p.id);
  db.prepare('DELETE FROM likes WHERE project_id = ?').run(p.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(p.id);
  res.json({ok: true});
});

app.post('/api/projects/:slug/like', isAuth, (req, res) => {
  const p = db.prepare('SELECT id FROM projects WHERE slug = ?').get(req.params.slug);
  const exists = db.prepare('SELECT 1 FROM likes WHERE project_id = ? AND user_id = ?').get(p.id, req.session.userId);
  if (exists) db.prepare('DELETE FROM likes WHERE project_id = ? AND user_id = ?').run(p.id, req.session.userId);
  else db.prepare('INSERT INTO likes (project_id, user_id) VALUES (?, ?)').run(p.id, req.session.userId);
  const likes = db.prepare('SELECT COUNT(*) as c FROM likes WHERE project_id = ?').get(p.id).c;
  res.json({liked: !exists, likes});
});

app.get('/api/projects/:slug/comments', (req, res) => {
  const p = db.prepare('SELECT id FROM projects WHERE slug = ?').get(req.params.slug);
  const comments = db.prepare('SELECT c.*, u.username FROM comments c JOIN users u ON c.user_id = u.id WHERE project_id = ? ORDER BY created_at ASC').all(p.id);
  res.json(comments);
});

app.post('/api/projects/:slug/comments', isAuth, (req, res) => {
  const p = db.prepare('SELECT id FROM projects WHERE slug = ?').get(req.params.slug);
  const stmt = db.prepare('INSERT INTO comments (project_id, user_id, body, created_at) VALUES (?, ?, ?, ?)');
  const info = stmt.run(p.id, req.session.userId, req.body.body, Math.floor(Date.now()/1000));
  const u = db.prepare('SELECT username FROM users WHERE id = ?').get(req.session.userId);
  res.json({id: info.lastInsertRowid, username: u.username, body: req.body.body, created_at: Math.floor(Date.now()/1000)});
});

app.delete('/api/projects/:slug/file/:id', isAuth, (req, res) => {
  const p = db.prepare('SELECT id, owner_id FROM projects WHERE slug = ?').get(req.params.slug);
  if (!p || (!req.session.isAdmin && p.owner_id !== req.session.userId)) return res.status(403).json({error: 'forbidden'});
  const f = db.prepare('SELECT path FROM files WHERE id = ? AND project_id = ?').get(req.params.id, p.id);
  if (f) try { fs.unlinkSync(path.join('uploads', path.basename(f.path))); } catch(e){}
  db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id);
  res.json({ok: true});
});

app.get('/api/projects/:slug/file/:id/content', async (req, res) => {
  const f = db.prepare('SELECT f.path, p.is_private, p.password, p.owner_id, p.roblox FROM files f JOIN projects p ON f.project_id = p.id WHERE f.id = ? AND p.slug = ?').get(req.params.id, req.params.slug);
  if (!f) return res.status(404).json({error: 'not found'});
  
  if (f.is_private && f.owner_id !== req.session.userId && !f.roblox) {
    if (!f.password) return res.status(403).json({error: 'locked'});
    try {
      const match = await bcrypt.compare(req.query.password || '', f.password);
      if (!match) return res.status(403).json({error: 'locked'});
    } catch(e) { return res.status(403).json({error: 'locked'}); }
  }
  
  try { const content = fs.readFileSync(path.join('uploads', path.basename(f.path)), 'utf8'); res.json({content}); } catch(e) { res.status(500).json({error: 'read failed'}); }
});

app.put('/api/projects/:slug/file/:id/content', isAuth, (req, res) => {
  const p = db.prepare('SELECT id, owner_id FROM projects WHERE slug = ?').get(req.params.slug);
  if (!p || (!req.session.isAdmin && p.owner_id !== req.session.userId)) return res.status(403).json({error: 'forbidden'});
  const f = db.prepare('SELECT path FROM files WHERE id = ?').get(req.params.id);
  try { fs.writeFileSync(path.join('uploads', path.basename(f.path)), req.body.content); res.json({ok: true}); } catch(e) { res.status(500).json({error: 'write failed'}); }
});

app.get('/api/projects/:slug/file/:id/view', async (req, res) => {
  const f = db.prepare('SELECT f.path, p.is_private, p.password, p.owner_id, p.roblox FROM files f JOIN projects p ON f.project_id = p.id WHERE f.id = ? AND p.slug = ?').get(req.params.id, req.params.slug);
  if (!f) return res.status(404).send('not found');
  
  if (f.is_private && f.owner_id !== req.session.userId && !f.roblox) {
    if (!f.password) return res.status(403).send('locked');
    try {
      const match = await bcrypt.compare(req.query.password || '', f.password);
      if (!match) return res.status(403).send('locked');
    } catch(e) { return res.status(403).send('locked'); }
  }
  
  res.setHeader('Content-Type', 'text/plain');
  res.sendFile(path.join(__dirname, 'uploads', path.basename(f.path)));
});

app.get('/api/projects/:slug/download/:id', async (req, res) => {
  const f = db.prepare('SELECT f.path, f.name, p.is_private, p.password, p.owner_id, p.roblox FROM files f JOIN projects p ON f.project_id = p.id WHERE f.id = ? AND p.slug = ?').get(req.params.id, req.params.slug);
  if (!f) return res.status(404).send('not found');
  
  if (f.is_private && f.owner_id !== req.session.userId && !f.roblox) {
    if (!f.password) return res.status(403).send('locked');
    try {
      const match = await bcrypt.compare(req.query.password || '', f.password);
      if (!match) return res.status(403).send('locked');
    } catch(e) { return res.status(403).send('locked'); }
  }
  
  res.download(path.join(__dirname, 'uploads', path.basename(f.path)), path.basename(f.name));
});

app.get('/api/admin/users', isAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, is_admin, created_at FROM users').all();
  users.forEach(u => u.project_count = db.prepare('SELECT COUNT(*) as c FROM projects WHERE owner_id = ?').get(u.id).c);
  res.json(users);
});

app.delete('/api/admin/users/:id', isAdmin, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ok:true});
});

app.get('/api/admin/projects', isAdmin, (req, res) => {
  const projects = db.prepare('SELECT p.id, p.slug, p.owner_id, p.title, p.description, p.is_private, p.is_downloadable, p.instant_download, p.roblox, p.views, p.created_at, u.username as owner FROM projects p JOIN users u ON p.owner_id = u.id').all();
  res.json(projects);
});

app.get('/api/admin/tokens', isAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM admin_tokens').all());
});

app.delete('/api/admin/tokens/:id', isAdmin, (req, res) => {
  db.prepare('DELETE FROM admin_tokens WHERE id = ?').run(req.params.id);
  res.json({ok:true});
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).send({ error: 'bad request' });
  }
  res.status(500).json({error: 'server error'});
});

app.listen(3000, () => console.log('Vault n Drop secure server running on port 3000'));
