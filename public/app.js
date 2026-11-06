
const $ = (selector) => document.querySelector(selector);

const loginScreen = $("#login-screen");
const loginForm = $("#login-form");
const loginError = $("#login-error");
const app = $("#app");

let users = [];

/* UTILITÁRIOS */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;

  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(isFormData ? {} : options.body ? {
        "Content-Type": "application/json"
      } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Erro HTTP ${response.status}`);
  }

  return data;
}

/* NAVEGAÇÃO */

function openPanel(target) {
  const sections = document.querySelectorAll("[data-view]");
  const buttons = document.querySelectorAll("[data-panel]");

  sections.forEach((section) => {
    section.classList.toggle(
      "hidden",
      section.dataset.view !== target
    );
  });

  buttons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.panel === target
    );
  });

  const titles = {
    dashboard: "Dashboard",
    users: "Usuários",
    create: "Criar usuário",
    games: "Publicar jogo"
  };

  const heading = $(".topbar h1");

  if (heading) {
    heading.textContent = titles[target] || "Painel administrativo";
  }
}

document.querySelectorAll("[data-panel]").forEach((button) => {
  button.addEventListener("click", () => {
    openPanel(button.dataset.panel);
  });
});

/* LOGIN */

function showLogin(message = "") {
  loginScreen?.classList.remove("hidden");
  app?.classList.add("hidden");

  if (loginError) {
    loginError.textContent = message;
  }
}

function showApp() {
  loginScreen?.classList.add("hidden");
  app?.classList.remove("hidden");

  if (loginError) {
    loginError.textContent = "";
  }

  openPanel("dashboard");
}

async function checkSession() {
  try {
    await api("/api/admin/me");
    showApp();
    await loadUsers();
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
    await loadUsers();
  } catch (error) {
    showLogin(error.message);
  } finally {
    if (button) button.disabled = false;
  }
});

/* SAIR */

$("#logout")?.addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", {
      method: "POST"
    });
  } catch (error) {
    console.error(error);
  }

  users = [];
  showLogin();
});

/* CARREGAR USUÁRIOS */

async function loadUsers() {
  const tbody = $("#users-body");

  try {
    const data = await api("/api/admin/users");

    users = Array.isArray(data)
      ? data
      : Array.isArray(data.users)
        ? data.users
        : [];

    renderUsers();
    updateStats();
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">${escapeHTML(error.message)}</td>
        </tr>
      `;
    }
  }
}

/* DADOS DOS USUÁRIOS */

function getUserId(user) {
  return user.id ?? user.userId ?? user.username ?? user.email;
}

function getUserPlan(user) {
  return String(user.plan ?? user.type ?? "free").toLowerCase();
}

function isExpired(user) {
  const expiration =
    user.expiresAt ??
    user.expires_at ??
    user.expiration;

  if (!expiration) return false;

  const date = new Date(expiration);

  return !Number.isNaN(date.getTime()) && date < new Date();
}

function isActive(user) {
  return user.active !== false &&
    user.disabled !== true &&
    user.status !== "inactive" &&
    !isExpired(user);
}

/* LISTA DE USUÁRIOS */

function renderUsers() {
  const tbody = $("#users-body");

  if (!tbody) return;

  const search = ($("#search")?.value || "").toLowerCase();

  const filtered = users.filter((user) => {
    const text = [
      user.username,
      user.name,
      user.email,
      user.plan,
      user.note
    ].join(" ").toLowerCase();

    return text.includes(search);
  });

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Nenhum usuário encontrado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((user) => {
    const id = getUserId(user);
    const plan = getUserPlan(user);
    const active = isActive(user);

    const name =
      user.username ??
      user.name ??
      user.email ??
      id;

    const expiration =
      user.expiresAt ??
      user.expires_at ??
      user.expiration ??
      "—";

    return `
      <tr>
        <td>${escapeHTML(name)}</td>
        <td>${escapeHTML(plan.toUpperCase())}</td>
        <td>${active ? "Ativo" : "Inativo/Expirado"}</td>
        <td>${escapeHTML(expiration)}</td>
        <td>
          <button type="button"
            data-user-action="toggle"
            data-id="${escapeHTML(id)}">
            ${active ? "Desativar" : "Ativar"}
          </button>

          <button type="button"
            data-user-action="renew"
            data-id="${escapeHTML(id)}">
            Renovar
          </button>

          <button type="button"
            data-user-action="delete"
            data-id="${escapeHTML(id)}">
            Excluir
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

/* ESTATÍSTICAS */

function updateStats() {
  const total = users.length;

  const vip = users.filter(
    user => getUserPlan(user) === "vip"
  ).length;

  const free = users.filter(
    user => getUserPlan(user) !== "vip"
  ).length;

  const expired = users.filter(isExpired).length;

  if ($("#total")) $("#total").textContent = total;
  if ($("#vip")) $("#vip").textContent = vip;
  if ($("#free")) $("#free").textContent = free;
  if ($("#expired")) $("#expired").textContent = expired;
}

/* PESQUISA */

$("#search")?.addEventListener("input", renderUsers);

/* CRIAR USUÁRIO */

$("#create-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');

  const errorBox = $("#create-error");
  const generated = $("#generated");

  if (errorBox) errorBox.textContent = "";
  if (generated) generated.textContent = "";

  if (button) button.disabled = true;

  const formData = new FormData(form);

  const body = {
    plan: formData.get("plan") || "free",
    days: Number(formData.get("days") || 30),
    note: String(formData.get("note") || "")
  };

  try {
    const result = await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(body)
    });

    if (generated) {
      generated.textContent = JSON.stringify(result, null, 2);
    }

    form.reset();
    await loadUsers();

  } catch (error) {
    if (errorBox) {
      errorBox.textContent = error.message;
    }
  } finally {
    if (button) button.disabled = false;
  }
});

/* AÇÕES DOS USUÁRIOS */

$("#users-body")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-user-action]");

  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.userAction;

  if (!id) return;

  try {
    if (action === "delete") {
      if (!confirm("Tem certeza que deseja excluir este usuário?")) {
        return;
      }

      await api(
        `/api/admin/users/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
    }

    if (action === "toggle") {
      await api(
        `/api/admin/users/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ action: "toggle" })
        }
      );
    }

    if (action === "renew") {
      await api(
        `/api/admin/users/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            action: "renew",
            days: 30
          })
        }
      );
    }

    await loadUsers();

  } catch (error) {
    alert(error.message);
  }
});

/* PUBLICAR JOGO */

$("#game-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');

  const errorBox = $("#game-error");
  const resultBox = $("#game-result");

  if (errorBox) errorBox.textContent = "";
  if (resultBox) resultBox.textContent = "";

  if (button) button.disabled = true;

  try {
    const formData = new FormData(form);

    const result = await api("/api/admin/games", {
      method: "POST",
      body: formData
    });

    if (resultBox) {
      resultBox.innerHTML = `
        <h3>Jogo publicado com sucesso!</h3>
        <p>${escapeHTML(result.name || "")}</p>

        ${
          result.pageUrl
            ? `<p><a href="${escapeHTML(result.pageUrl)}" target="_blank" rel="noopener">Abrir página do jogo</a></p>`
            : ""
        }

        ${
          result.onlineUrl
            ? `<p><a href="${escapeHTML(result.onlineUrl)}" target="_blank" rel="noopener">Jogar online</a></p>`
            : ""
        }

        ${
          result.downloadUrl
            ? `<p><a href="${escapeHTML(result.downloadUrl)}" target="_blank" rel="noopener">Baixar jogo</a></p>`
            : ""
        }

        <p>${escapeHTML(result.message || "")}</p>
      `;
    }

    form.reset();

  } catch (error) {
    if (errorBox) {
      errorBox.textContent = error.message;
    }
  } finally {
    if (button) button.disabled = false;
  }
});

/* INICIALIZAÇÃO */

checkSession();
