let currentUser = null;
let selectedFiles = [];
let toastTimer = null;

const modalOverlay = document.getElementById('modal-overlay');
const btnNewProject = document.getElementById('btn-new-project');
const modalClose = document.getElementById('modal-close');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const chkPrivate = document.getElementById('chk-private');
const passwordField = document.getElementById('password-field');
const chkDownload = document.getElementById('chk-download');
const btnPublish = document.getElementById('btn-publish');
const projectsGrid = document.getElementById('projects-grid');
const publicGrid = document.getElementById('public-grid');
const emptyState = document.getElementById('empty-state');
const publicEmpty = document.getElementById('public-empty');
const navStorage = document.getElementById('nav-storage');
const navPublic = document.getElementById('nav-public');
const viewStorage = document.getElementById('view-storage');
const viewPublic = document.getElementById('view-public');
const sidebarUsername = document.getElementById('sidebar-username');
const btnLogout = document.getElementById('btn-logout');
const toast = document.getElementById('toast');

function showToast(msg, type) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = 'show ' + (type || '');
  toastTimer = setTimeout(() => { toast.className = ''; }, 3000);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

async function init() {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (!res.ok) { window.location.href = '/accountauth'; return; }
    currentUser = await res.json();
    sidebarUsername.textContent = currentUser.username;
  } catch {
    window.location.href = '/accountauth';
    return;
  }
  loadMyProjects();
}

async function loadMyProjects() {
  try {
    const res = await fetch('/api/projects/mine', { credentials: 'same-origin' });
    const data = await res.json();
    projectsGrid.innerHTML = '';
    if (!data.length) {
      emptyState.classList.add('show');
      return;
    }
    emptyState.classList.remove('show');
    data.forEach(p => projectsGrid.appendChild(buildMyCard(p)));
  } catch {
    showToast('could not load projects', 'error');
  }
}

async function loadPublicProjects() {
  try {
    const res = await fetch('/api/projects/public', { credentials: 'same-origin' });
    const data = await res.json();
    publicGrid.innerHTML = '';
    if (!data.length) {
      publicEmpty.classList.add('show');
      return;
    }
    publicEmpty.classList.remove('show');
    data.forEach(p => publicGrid.appendChild(buildPublicCard(p)));
  } catch {
    showToast('could not load public projects', 'error');
  }
}

function buildMyCard(p) {
  const card = document.createElement('div');
  card.className = 'proj-card';
  const link = window.location.origin + '/p/' + p.slug;
  card.innerHTML = `
    <div class="proj-card-top">
      <span class="proj-card-title">${esc(p.title)}</span>
      <span class="proj-badge ${p.is_private ? 'private' : 'public'}">${p.is_private ? 'private' : 'public'}</span>
    </div>
    <p class="proj-card-desc">${esc(p.description || 'no description')}</p>
    <div class="proj-card-meta">
      <span>${p.file_count} file${p.file_count !== 1 ? 's' : ''}</span>
      <span>·</span>
      <span>${p.is_downloadable ? 'downloadable' : 'view only'}</span>
      ${p.instant_download ? '<span>·</span><span style="color:#ff8c42;font-weight:500">instant dl</span>' : ''}
      <span>·</span>
      <span>${p.views || 0} views</span>
      <span>·</span>
      <span>${p.likes || 0} likes</span>
      <span>·</span>
      <span>${p.comments || 0} comments</span>
    </div>
    <div class="proj-card-actions">
      <button class="proj-link-btn copy" data-link="${link}">copy link</button>
      <a class="proj-link-btn" href="/p/${p.slug}" target="_blank">open</a>
      <button class="proj-link-btn delete-btn" data-slug="${p.slug}" style="color:#ff6b6b;border-color:rgba(255,77,77,0.2);">delete</button>
    </div>
  `;
  card.querySelector('.copy').addEventListener('click', function() {
    navigator.clipboard.writeText(this.dataset.link);
    showToast('link copied', 'success');
  });
  card.querySelector('.delete-btn').addEventListener('click', async function() {
    if (!confirm('delete this project? this cannot be undone.')) return;
    try {
      const res = await fetch('/api/projects/' + this.dataset.slug, { method: 'DELETE', credentials: 'same-origin' });
      if (res.ok) { showToast('project deleted', 'success'); loadMyProjects(); }
      else showToast('could not delete', 'error');
    } catch { showToast('could not delete', 'error'); }
  });
  return card;
}

function buildPublicCard(p) {
  const card = document.createElement('div');
  card.className = 'proj-card';
  const link = window.location.origin + '/p/' + p.slug;
  card.innerHTML = `
    <div class="proj-card-top">
      <span class="proj-card-title">${esc(p.title)}</span>
      <span class="proj-badge public">public</span>
    </div>
    <p class="proj-card-desc">${esc(p.description || 'no description')}</p>
    <div class="proj-card-meta">
      <span>by ${esc(p.owner)}</span>
      <span>·</span>
      <span>${p.file_count} file${p.file_count !== 1 ? 's' : ''}</span>
    </div>
    <div class="proj-card-actions">
      <button class="proj-link-btn copy" data-link="${link}">copy link</button>
      <a class="proj-link-btn" href="/p/${p.slug}" target="_blank">open</a>
    </div>
  `;
  card.querySelector('.copy').addEventListener('click', function() {
    navigator.clipboard.writeText(this.dataset.link);
    showToast('link copied', 'success');
  });
  return card;
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

navStorage.addEventListener('click', (e) => {
  e.preventDefault();
  navStorage.classList.add('active');
  navPublic.classList.remove('active');
  viewStorage.classList.add('active');
  viewPublic.classList.remove('active');
  loadMyProjects();
});

navPublic.addEventListener('click', (e) => {
  e.preventDefault();
  navPublic.classList.add('active');
  navStorage.classList.remove('active');
  viewPublic.classList.add('active');
  viewStorage.classList.remove('active');
  loadPublicProjects();
});

btnNewProject.addEventListener('click', () => {
  modalOverlay.classList.add('open');
});

modalClose.addEventListener('click', closeModal);

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

function closeModal() {
  modalOverlay.classList.remove('open');
  selectedFiles = [];
  fileList.innerHTML = '';
  fileInput.value = '';
  document.getElementById('proj-title').value = '';
  document.getElementById('proj-desc').value = '';
  document.getElementById('proj-password').value = '';
  chkPrivate.checked = false;
  chkDownload.checked = false;
  passwordField.classList.add('hidden');
}

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('over');
  addFiles([...e.dataTransfer.files]);
});

fileInput.addEventListener('change', () => {
  addFiles([...fileInput.files]);
});

function addFiles(files) {
  files.forEach(f => {
    if (!selectedFiles.find(x => x.name === f.name && x.size === f.size)) {
      selectedFiles.push(f);
    }
  });
  renderFileList();
}

function renderFileList() {
  fileList.innerHTML = '';
  selectedFiles.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <span class="file-item-name">${esc(f.name)}</span>
      <span class="file-item-size">${formatBytes(f.size)}</span>
      <button class="file-item-remove" data-i="${i}">✕</button>
    `;
    item.querySelector('.file-item-remove').addEventListener('click', function() {
      selectedFiles.splice(+this.dataset.i, 1);
      renderFileList();
    });
    fileList.appendChild(item);
  });
}

chkPrivate.addEventListener('change', () => {
  if (chkPrivate.checked) {
    passwordField.classList.remove('hidden');
  } else {
    passwordField.classList.add('hidden');
    document.getElementById('proj-password').value = '';
  }
});

btnPublish.addEventListener('click', () => {
  const title = document.getElementById('proj-title').value.trim();
  const desc = document.getElementById('proj-desc').value.trim();
  const isPrivate = chkPrivate.checked;
  const password = document.getElementById('proj-password').value;
  const isDownloadable = chkDownload.checked;

  if (!title) { showToast('add a project title', 'error'); return; }
  if (!selectedFiles.length) { showToast('add at least one file', 'error'); return; }
  if (isPrivate && !password) { showToast('set a password for private project', 'error'); return; }

  btnPublish.disabled = true;
  btnPublish.textContent = 'uploading...';

  const form = new FormData();
  form.append('title', title);
  form.append('description', desc);
  form.append('is_private', isPrivate ? '1' : '0');
  form.append('is_downloadable', isDownloadable ? '1' : '0');
  form.append('instant_download', document.getElementById('chk-instant').checked ? '1' : '0');
  if (isPrivate) form.append('password', password);
  selectedFiles.forEach(f => form.append('files', f));

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/projects');
  xhr.withCredentials = true;

  let progressBar = document.getElementById('upload-progress');
  if (!progressBar) {
    progressBar = document.createElement('div');
    progressBar.id = 'upload-progress';
    progressBar.style.cssText = 'height:2px;background:var(--border);border-radius:2px;overflow:hidden;margin-top:8px;';
    progressBar.innerHTML = '<div id="upload-bar" style="height:100%;width:0%;background:var(--green);transition:width 0.2s;border-radius:2px;"></div>';
    btnPublish.parentNode.insertBefore(progressBar, btnPublish);
  }

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      document.getElementById('upload-bar').style.width = pct + '%';
      btnPublish.textContent = 'uploading ' + pct + '%...';
    }
  });

  xhr.addEventListener('load', () => {
    progressBar.remove();
    try {
      const data = JSON.parse(xhr.responseText);
      if (xhr.status === 200 && data.ok) {
        showToast('project published', 'success');
        closeModal();
        loadMyProjects();
      } else {
        showToast(data.error || 'publish failed', 'error');
      }
    } catch (e) {
      showToast('server error', 'error');
    }
    btnPublish.disabled = false;
    btnPublish.textContent = 'publish project';
  });

  xhr.addEventListener('error', () => {
    if (progressBar.parentNode) progressBar.remove();
    showToast('upload failed — check your connection', 'error');
    btnPublish.disabled = false;
    btnPublish.textContent = 'publish project';
  });

  xhr.send(form);
});

btnLogout.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

init();
