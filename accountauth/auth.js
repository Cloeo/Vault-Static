const toast = document.getElementById('toast');
let toastTimer = null;
let activeCard = 'card-register';

function showToast(msg, type) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = 'show ' + (type || '');
  toastTimer = setTimeout(() => { toast.className = ''; }, 3200);
}

function setError(input, on) {
  if (input) input.classList.toggle('error', on);
}

function switchTo(targetId) {
  activeCard = targetId;
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.target === targetId);
  });
  document.querySelectorAll('.auth-card').forEach(c => {
    c.classList.remove('active-card');
  });
  const target = document.getElementById(targetId);
  if (target) target.classList.add('active-card');
}

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => switchTo(tab.dataset.target));
});

const btnRegister = document.getElementById('btn-register');
if (btnRegister) {
  btnRegister.addEventListener('click', async () => {
    const usernameEl = document.getElementById('reg-username');
    const passwordEl = document.getElementById('reg-password');
    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    setError(usernameEl, false);
    setError(passwordEl, false);
    if (!username) { setError(usernameEl, true); showToast('enter a username', 'error'); return; }
    if (password.length < 6) { setError(passwordEl, true); showToast('password must be at least 6 characters', 'error'); return; }
    btnRegister.disabled = true;
    btnRegister.textContent = 'creating...';
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('account created!', 'success');
        window.location.href = '/projectstorage';
      } else {
        showToast(data.error || 'something went wrong', 'error');
        if (data.field === 'username') setError(usernameEl, true);
        if (data.field === 'password') setError(passwordEl, true);
      }
    } catch {
      showToast('could not connect to server', 'error');
    }
    btnRegister.disabled = false;
    btnRegister.textContent = 'create account';
  });
}

const btnLogin = document.getElementById('btn-login');
if (btnLogin) {
  btnLogin.addEventListener('click', async () => {
    const usernameEl = document.getElementById('login-username');
    const passwordEl = document.getElementById('login-password');
    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    setError(usernameEl, false);
    setError(passwordEl, false);
    if (!username) { setError(usernameEl, true); showToast('enter your username', 'error'); return; }
    if (!password) { setError(passwordEl, true); showToast('enter your password', 'error'); return; }
    btnLogin.disabled = true;
    btnLogin.textContent = 'logging in...';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('welcome back!', 'success');
        window.location.href = '/projectstorage';
      } else {
        if (data.field === 'username') { setError(usernameEl, true); showToast('username is wrong', 'error'); }
        else if (data.field === 'password') { setError(passwordEl, true); showToast('password is wrong', 'error'); }
        else showToast(data.error || 'something went wrong', 'error');
      }
    } catch {
      showToast('could not connect to server', 'error');
    }
    btnLogin.disabled = false;
    btnLogin.textContent = 'login to account';
  });
}

const btnAdmin = document.getElementById('btn-admin');
if (btnAdmin) {
  btnAdmin.addEventListener('click', async () => {
    const usernameEl = document.getElementById('admin-username');
    const tokenEl = document.getElementById('admin-token-input');
    const username = usernameEl.value.trim();
    const token = tokenEl.value.trim();
    setError(usernameEl, false);
    setError(tokenEl, false);
    if (!username) { setError(usernameEl, true); showToast('enter your username', 'error'); return; }
    if (!token) { setError(tokenEl, true); showToast('enter your admin token', 'error'); return; }
    btnAdmin.disabled = true;
    btnAdmin.textContent = 'verifying...';
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ code: token, username })
      });
      const data = await res.json();
      if (res.ok) {
        sessionStorage.setItem('admin_token', data.token);
        showToast('welcome, admin!', 'success');
        setTimeout(() => { window.location.href = '/adminpanel'; }, 800);
      } else {
        showToast(data.error || 'invalid token', 'error');
        setError(tokenEl, true);
      }
    } catch {
      showToast('could not connect to server', 'error');
    }
    btnAdmin.disabled = false;
    btnAdmin.textContent = 'sign in';
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (activeCard === 'card-register' && btnRegister) btnRegister.click();
  else if (activeCard === 'card-login' && btnLogin) btnLogin.click();
  else if (activeCard === 'card-admin' && btnAdmin) btnAdmin.click();
});
