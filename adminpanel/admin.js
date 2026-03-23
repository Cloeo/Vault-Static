let adminToken = sessionStorage.getItem('admin_token') || null;
let toastTimer = null;

function showToast(msg, type) {
  clearTimeout(toastTimer);
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + (type || '');
  toastTimer = setTimeout(() => { t.className = ''; }, 3000);
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

async function apiAdmin(path, method, body) {
  const opts = { method: method || 'GET', credentials: 'same-origin', headers: { 'x-admin-token': adminToken || '' } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  return fetch('/api/admin' + path, opts);
}

async function init() {
  if (adminToken) {
    const r = await apiAdmin('/verify');
    if (r.ok) {
      const d = await r.json();
      showAdminPanel(d.username);
      return;
    }
    sessionStorage.removeItem('admin_token');
    adminToken = null;
  }
  document.getElementById('verify-gate').classList.remove('hidden');
}

document.getElementById('gate-submit').addEventListener('click', async () => {
  const code = document.getElementById('gate-code').value.trim();
  const err = document.getElementById('gate-err');
  err.textContent = '';
  if (!code) { err.textContent = 'enter your auth code'; return; }
  const btn = document.getElementById('gate-submit');
  btn.disabled = true;
  btn.textContent = 'checking...';
  const r = await fetch('/api/admin/auth', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  const d = await r.json();
  if (r.ok) {
    adminToken = d.token;
    sessionStorage.setItem('admin_token', adminToken);
    document.getElementById('verify-gate').classList.add('hidden');
    showAdminPanel(d.username);
  } else {
    err.textContent = d.error || 'invalid code';
  }
  btn.disabled = false;
  btn.textContent = 'submit';
});

document.getElementById('gate-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('gate-submit').click(); });

function showAdminPanel(username) {
  const panel = document.getElementById('admin-panel');
  panel.classList.remove('hidden');
  panel.style.animation = 'none';
  panel.offsetHeight;
  panel.style.animation = '';
  document.getElementById('admin-welcome').textContent = 'signed in as ' + username;
  loadUsers();
}

document.getElementById('admin-logout').addEventListener('click', () => {
  sessionStorage.removeItem('admin_token');
  adminToken = null;
  document.getElementById('admin-panel').classList.add('hidden');
  document.getElementById('verify-gate').classList.remove('hidden');
  document.getElementById('verify-gate').style.animation = 'none';
  document.getElementById('verify-gate').offsetHeight;
  document.getElementById('verify-gate').style.animation = '';
  document.getElementById('gate-code').value = '';
  document.getElementById('gate-err').textContent = '';
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'users') loadUsers();
    if (btn.dataset.tab === 'projects') loadProjects();
    if (btn.dataset.tab === 'tokens') loadTokens();
  });
});

async function loadUsers() {
  const list = document.getElementById('users-list');
  list.innerHTML = '<div class="empty-msg">loading...</div>';
  const r = await apiAdmin('/users');
  if (!r.ok) { list.innerHTML = '<div class="empty-msg">failed to load</div>'; return; }
  const users = await r.json();
  list.innerHTML = '';
  if (!users.length) { list.innerHTML = '<div class="empty-msg">no users</div>'; return; }
  users.forEach(u => {
    const row = document.createElement('div');
    row.className = 'data-row';
    row.innerHTML =
      '<div class="data-row-info">' +
        '<span class="data-row-name">' + esc(u.username) + ' <span class="badge ' + (u.is_admin ? 'badge-admin' : 'badge-user') + '">' + (u.is_admin ? 'admin' : 'user') + '</span></span>' +
        '<span class="data-row-meta">id ' + u.id + ' · joined ' + new Date(u.created_at * 1000).toLocaleDateString() + ' · ' + u.project_count + ' projects</span>' +
      '</div>' +
      '<div class="data-row-actions">' +
        '<button class="action-btn danger" data-id="' + u.id + '" data-action="delete-user">delete</button>' +
      '</div>';
    row.querySelector('[data-action="delete-user"]').addEventListener('click', async function() {
      if (!confirm('delete user ' + u.username + '? this removes all their projects too.')) return;
      const res = await apiAdmin('/users/' + this.dataset.id, 'DELETE');
      if (res.ok) { showToast('user deleted', 'success'); loadUsers(); }
      else showToast('failed', 'error');
    });
    list.appendChild(row);
  });
}

document.getElementById('user-search').addEventListener('input', function() {
  const q = this.value.toLowerCase();
  document.querySelectorAll('#users-list .data-row').forEach(row => {
    row.style.display = row.querySelector('.data-row-name').textContent.toLowerCase().includes(q) ? '' : 'none';
  });
});

async function loadProjects() {
  const list = document.getElementById('projects-list');
  list.innerHTML = '<div class="empty-msg">loading...</div>';
  const r = await apiAdmin('/projects');
  if (!r.ok) { list.innerHTML = '<div class="empty-msg">failed to load</div>'; return; }
  const projects = await r.json();
  list.innerHTML = '';
  if (!projects.length) { list.innerHTML = '<div class="empty-msg">no projects</div>'; return; }
  projects.forEach(p => {
    const row = document.createElement('div');
    row.className = 'data-row';
    row.innerHTML =
      '<div class="data-row-info">' +
        '<span class="data-row-name">' + esc(p.title) + ' <span class="badge ' + (p.is_private ? 'badge-priv' : 'badge-pub') + '">' + (p.is_private ? 'private' : 'public') + '</span></span>' +
        '<span class="data-row-meta">by ' + esc(p.owner) + ' · ' + p.views + ' views · /p/' + esc(p.slug) + '</span>' +
      '</div>' +
      '<div class="data-row-actions">' +
        '<a class="action-btn" href="/p/' + esc(p.slug) + '" target="_blank">open</a>' +
        '<button class="action-btn danger" data-slug="' + esc(p.slug) + '" data-action="delete-proj">delete</button>' +
      '</div>';
    row.querySelector('[data-action="delete-proj"]').addEventListener('click', async function() {
      if (!confirm('delete project ' + p.title + '?')) return;
      const res = await apiAdmin('/projects/' + this.dataset.slug, 'DELETE');
      if (res.ok) { showToast('project deleted', 'success'); loadProjects(); }
      else showToast('failed', 'error');
    });
    list.appendChild(row);
  });
}

document.getElementById('proj-search').addEventListener('input', function() {
  const q = this.value.toLowerCase();
  document.querySelectorAll('#projects-list .data-row').forEach(row => {
    row.style.display = row.querySelector('.data-row-name').textContent.toLowerCase().includes(q) ? '' : 'none';
  });
});

async function loadTokens() {
  const list = document.getElementById('tokens-list');
  list.innerHTML = '<div class="empty-msg">loading...</div>';
  const r = await apiAdmin('/tokens');
  if (!r.ok) { list.innerHTML = '<div class="empty-msg">failed to load</div>'; return; }
  const tokens = await r.json();
  list.innerHTML = '';
  if (!tokens.length) { list.innerHTML = '<div class="empty-msg">no tokens yet. use /gift-verified-code in discord.</div>'; return; }
  tokens.forEach(t => {
    const row = document.createElement('div');
    row.className = 'data-row';
    row.innerHTML =
      '<div class="data-row-info">' +
        '<span class="data-row-name">' + esc(t.website_username) + '</span>' +
        '<span class="data-row-meta">' + (t.used ? 'used · signed in as admin' : 'pending · not yet used') + ' · created ' + new Date(t.created_at * 1000).toLocaleDateString() + '</span>' +
      '</div>' +
      '<div class="data-row-actions">' +
        '<span class="token-code">' + esc(t.code) + '</span>' +
        '<button class="action-btn danger" data-id="' + t.id + '" data-action="revoke">revoke</button>' +
      '</div>';
    row.querySelector('[data-action="revoke"]').addEventListener('click', async function() {
      if (!confirm('revoke this token?')) return;
      const res = await apiAdmin('/tokens/' + this.dataset.id, 'DELETE');
      if (res.ok) { showToast('token revoked', 'success'); loadTokens(); }
      else showToast('failed', 'error');
    });
    list.appendChild(row);
  });
}

init();
