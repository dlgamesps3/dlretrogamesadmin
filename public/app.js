const $ = (s) => document.querySelector(s);

const loginScreen = $("#login-screen");
const app = $("#app");

let users = [];

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    credentials: "same-origin"
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Não foi possível concluir a operação.");
  }

  return data;
}

function showApp() {
  loginScreen.classList.add("hidden");
  app.classList.remove("hidden");
}

function showLogin() {
  app.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function dateLabel(value) {
  if (!value) return "Sem validade";

  const d = new Date(value);

  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("pt-BR");
}

function statusOf(u) {
  if (u.blocked) return ["BLOQUEADO", "blocked-pill"];

  if (u.expires_at && new Date(u.expires_at) < new Date()) {
    return ["EXPIRADO", "expired-pill"];
  }

  return ["ATIVO", "active-pill"];
}

async function loadUsers() {
  const data = await api("/api/admin/users");

  users = data.users || [];

  $("#total").textContent = users.length;

  $("#vip").textContent = users.filter(
    u => u.plan === "VIP" && statusOf(u)[0] === "ATIVO"
  ).length;

  $("#free").textContent = users.filter(
    u => u.plan === "GRATIS" && statusOf(u)[0] === "ATIVO"
  ).length;

  $("#expired").textContent = users.filter(
    u => statusOf(u)[0] === "EXPIRADO"
  ).length;

  renderUsers();
}

function renderUsers() {
  const term = $("#search").value.toLowerCase();

  const filtered = users.filter(u =>
    (u.username + " " + (u.note || "")).toLowerCase().includes(term)
  );

  $("#users-body").innerHTML = filtered.length
    ? filtered.map(u => {
        const [label, cls] = statusOf(u);

        return `<tr>
          <td>
            <b>${escapeHtml(u.username)}</b><br>
            <small>${escapeHtml(u.note || "")}</small>
          </td>

          <td>${u.plan === "VIP" ? "VIP" : "Grátis"}</td>

          <td>${dateLabel(u.expires_at)}</td>

          <td>
            <span class="pill ${cls}">${label}</span>
          </td>

          <td>
            <div class="actions">
              <button data-action="renew" data-id="${u.id}">
                Renovar 30d
              </button>

              <button data-action="toggle" data-id="${u.id}">
                ${u.blocked ? "Liberar" : "Bloquear"}
              </button>

              <button class="danger" data-action="delete" data-id="${u.id}">
                Excluir
              </button>
            </div>
          </td>
        </tr>`;
      }).join("")
    : '<tr><td colspan="5">Nenhum usuário encontrado.</td></tr>';
}

// LOGIN
const loginForm = $("#login-form");

if (loginForm) {
  loginForm.addEventListener("submit", async e => {
    e.preventDefault();

    $("#login-error").textContent = "";

    const form = new FormData(loginForm);

    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password")
        })
      });

      loginForm.reset();

      showApp();

      await loadUsers();

    } catch (err) {
      $("#login-error").textContent = err.message;
    }
  });
}

// SAIR
$("#logout").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", {
      method: "POST",
      body: "{}"
    });
  } finally {
    showLogin();
  }
});

// CADASTRAR CLIENTE
const createForm = $("#create-form");

createForm.addEventListener("submit", async e => {
  e.preventDefault();

  $("#create-error").textContent = "";
  $("#generated").classList.add("hidden");

  // Guarda os dados antes da operação assíncrona
  const f = new FormData(createForm);

  try {
    const data = await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        plan: f.get("plan"),
        days: Number(f.get("days")),
        note: f.get("note")
      })
    });

    $("#generated").innerHTML = `
      <strong>
        ACESSO CRIADO — copie e entregue ao cliente agora.
      </strong>

      <div class="credential">
        <span>
          Usuário: <b>${escapeHtml(data.username)}</b>
        </span>

        <button type="button" data-copy="${escapeHtml(data.username)}">
          Copiar
        </button>
      </div>

      <div class="credential">
        <span>
          Senha: <b>${escapeHtml(data.password)}</b>
        </span>

        <button type="button" data-copy="${escapeHtml(data.password)}">
          Copiar
        </button>
      </div>

      <small>
        Por segurança, a senha não será exibida novamente.
      </small>
    `;

    $("#generated").classList.remove("hidden");

    // CORREÇÃO: usa createForm, não e.currentTarget
    createForm.reset();

    await loadUsers();

  } catch (err) {
    $("#create-error").textContent = err.message;
  }
});

// AÇÕES DOS CLIENTES
$("#users-body").addEventListener("click", async e => {
  const b = e.target.closest("button[data-action]");

  if (!b) return;

  const id = b.dataset.id;
  const action = b.dataset.action;

  if (
    action === "delete" &&
    !confirm("Excluir este usuário permanentemente?")
  ) {
    return;
  }

  try {
    if (action === "delete") {
      await api(`/api/admin/users/${id}`, {
        method: "DELETE"
      });

    } else if (action === "toggle") {
      await api(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "toggle" })
      });

    } else {
      await api(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "renew",
          days: 30
        })
      });
    }

    $("#notice").textContent = "Alteração realizada.";

    await loadUsers();

  } catch (err) {
    $("#notice").textContent = err.message;
  }
});

// COPIAR USUÁRIO E SENHA
$("#generated").addEventListener("click", async e => {
  const b = e.target.closest("[data-copy]");

  if (!b) return;

  try {
    await navigator.clipboard.writeText(b.dataset.copy);
    b.textContent = "Copiado!";
  } catch {
    $("#create-error").textContent =
      "Não foi possível copiar automaticamente.";
  }
});

// PESQUISAR CLIENTES
$("#search").addEventListener("input", renderUsers);

// VERIFICAR SESSÃO
(async () => {
  try {
    await api("/api/admin/me");

    showApp();

    await loadUsers();

  } catch {
    showLogin();
  }
})();
