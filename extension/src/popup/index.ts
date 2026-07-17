const authStateEl = document.getElementById('auth-state')!;
const healthStateEl = document.getElementById('health-state')!;
const loginForm = document.getElementById('login-form')!;
const authedSection = document.getElementById('authed')!;
const formError = document.getElementById('form-error')!;
const emailInput = document.getElementById('email') as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;
const apiBaseInput = document.getElementById('api-base') as HTMLInputElement;

function send<T>(message: unknown): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response as T));
  });
}

async function refreshUi() {
  const status = await send<{
    auth: {
      accessToken: string | null;
      apiBaseUrl: string;
    };
    health: {
      apiReachable: boolean;
      authenticated: boolean;
      queueDepth: number;
    };
  }>({ type: 'GET_STATUS' });

  apiBaseInput.value = status.auth.apiBaseUrl;
  const signedIn = Boolean(status.auth.accessToken);
  authStateEl.textContent = signedIn ? 'Signed in' : 'Not signed in';
  healthStateEl.textContent = `API ${
    status.health.apiReachable ? 'online' : 'offline'
  } · Queue ${status.health.queueDepth}`;

  loginForm.classList.toggle('hidden', signedIn);
  authedSection.classList.toggle('hidden', !signedIn);
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.textContent = '';
  await send({ type: 'SET_API_BASE', apiBaseUrl: apiBaseInput.value });
  const result = await send<{ success: boolean; message?: string }>({
    type: 'LOGIN',
    email: emailInput.value,
    password: passwordInput.value,
  });
  if (!result.success) {
    formError.textContent = result.message ?? 'Login failed';
    return;
  }
  await refreshUi();
});

document.getElementById('logout')!.addEventListener('click', async () => {
  await send({ type: 'LOGOUT' });
  await refreshUi();
});

document.getElementById('sync-now')!.addEventListener('click', async () => {
  await send({ type: 'FLUSH_QUEUE' });
  await refreshUi();
});

refreshUi();
