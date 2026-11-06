
const $ = (selector) => document.querySelector(selector);

const loginScreen = $("#login-screen");
const loginForm = $("#login-form");
const loginError = $("#login-error");
const app = $("#app");

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Erro HTTP ${response.status}`);
  }

  return data;
}

function showLogin(message = "") {
  loginScreen?.classList.remove("hidden");
  app?.classList.add("hidden");
  if (loginError) loginError.textContent = message;
}

function showApp() {
  loginScreen?.classList.add("hidden");
  app?.classList.remove("hidden");
  if (loginError) loginError.textContent = "";
}

async function checkSession() {
  try {
    await api("/api/admin/me");
    showApp();
  } catch {
    showLogin();
  }
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = loginForm.querySelector('button[type="submit"]');
  const form = new FormData(loginForm);

  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");

  if (button) button.disabled = true;
  if (loginError) loginError.textContent = "";

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    await api("/api/admin/me");
    loginForm.reset();
    showApp();
  } catch (error) {
    showLogin(error.message || "Falha ao entrar.");
  } finally {
    if (button) button.disabled = false;
  }
});

$("#logout")?.addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
  } catch (error) {
    console.error("Erro ao sair:", error);
  }

  showLogin();
});

checkSession();
