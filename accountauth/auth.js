const cardWrap = document.getElementById('card-wrap');
const goLogin = document.getElementById('go-login');
const goRegister = document.getElementById('go-register');
const btnRegister = document.getElementById('btn-register');
const btnLogin = document.getElementById('btn-login');
const toast = document.getElementById('toast');

let toastTimer = null;

function showToast(msg, type) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = 'show ' + type;
  toastTimer = setTimeout(() => { toast.className = ''; }, 3200);
}

function setError(input, on) {
  input.classList.toggle('error', on);
}

goLogin.addEventListener('click', () => cardWrap.classList.add('flipped'));
goRegister.addEventListener('click', () => cardWrap.classList.remove('flipped'));

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

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (!cardWrap.classList.contains('flipped')) btnRegister.click();
  else btnLogin.click();
});
