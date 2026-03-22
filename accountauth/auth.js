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
  toastTimer = setTimeout(() => {
    toast.className = '';
  }, 3200);
}

function setError(input, on) {
  if (on) {
    input.classList.add('error');
  } else {
    input.classList.remove('error');
  }
}

goLogin.addEventListener('click', () => {
  cardWrap.classList.add('flipped');
});

goRegister.addEventListener('click', () => {
  cardWrap.classList.remove('flipped');
});

btnRegister.addEventListener('click', async () => {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;

  setError(document.getElementById('reg-username'), false);
  setError(document.getElementById('reg-password'), false);

  if (!username) {
    setError(document.getElementById('reg-username'), true);
    showToast('enter a username', 'error');
    return;
  }

  if (password.length < 6) {
    setError(document.getElementById('reg-password'), true);
    showToast('password must be at least 6 characters', 'error');
    return;
  }

  btnRegister.disabled = true;

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok) {
      showToast('account created — welcome!', 'success');
      setTimeout(() => {
        window.location.href = '/projectstorage';
      }, 1000);
    } else {
      showToast(data.error || 'something went wrong', 'error');
      if (data.field === 'username') setError(document.getElementById('reg-username'), true);
    }
  } catch {
    showToast('could not connect to server', 'error');
  }

  btnRegister.disabled = false;
});

btnLogin.addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  setError(document.getElementById('login-username'), false);
  setError(document.getElementById('login-password'), false);

  if (!username) {
    setError(document.getElementById('login-username'), true);
    showToast('enter your username', 'error');
    return;
  }

  if (!password) {
    setError(document.getElementById('login-password'), true);
    showToast('enter your password', 'error');
    return;
  }

  btnLogin.disabled = true;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok) {
      showToast('welcome back!', 'success');
      setTimeout(() => {
        window.location.href = '/projectstorage';
      }, 900);
    } else {
      if (data.field === 'username') {
        setError(document.getElementById('login-username'), true);
        showToast('username is wrong', 'error');
      } else if (data.field === 'password') {
        setError(document.getElementById('login-password'), true);
        showToast('password is wrong', 'error');
      } else {
        showToast(data.error || 'something went wrong', 'error');
      }
    }
  } catch {
    showToast('could not connect to server', 'error');
  }

  btnLogin.disabled = false;
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (!cardWrap.classList.contains('flipped')) {
    btnRegister.click();
  } else {
    btnLogin.click();
  }
});
