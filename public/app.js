
const $ = s => document.querySelector(s);

const loginScreen = $("#login-screen");
const app = $("#app");

let users = [];

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    ...options,
    headers,
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
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-BR");
}

function statusOf(u) {
  if (u.blocked) return ["BLOQUEADO", "blocked-pill"];
  if (u.expires_at && new Date(u.expires_at) < new Date()) {
    return ["EXPIRADO", "expired-pill"];
  }
  return ["ATIVO", "active-pill"];
}

// =========================
// USUÁRIOS
// =========================

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
          <td><b>${escapeHtml(u.username)}</b><br>
          <small>${escapeHtml(u.note || "")}</small></td>
          <td>${u.plan === "VIP" ? "VIP" : "Grátis"}</td>
          <td>${dateLabel(u.expires_at)}</td>
          <td><span class="pill ${cls}">${label}</span></td>
          <td><div class="actions">
            <button data-action="renew" data-id="${u.id}">Renovar 30d</button>
            <button data-action="toggle" data-id="${u.id}">
              ${u.blocked ? "Liberar" : "Bloquear"}
            </button>
            <button class="danger" data-action="delete" data-id="${u.id}">Excluir</button>
          </div></td>
        </tr>`;
      }).join("")
    : '<tr><td colspan="5">Nenhum usuário encontrado.</td></tr>';
}

// =========================
// LOGIN
// =========================

const loginForm = $("#login-form");

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

// =========================
// SAIR
// =========================

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

// =========================
// GERAR ACESSO
// =========================

const createForm = $("#create-form");

createForm.addEventListener("submit", async e => {
  e.preventDefault();

  $("#create-error").textContent = "";
  $("#generated").classList.add("hidden");

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
      <strong>ACESSO CRIADO!</strong>
      <div class="credential">
        <span>Usuário: <b>${escapeHtml(data.username)}</b></span>
        <button type="button" data-copy="${escapeHtml(data.username)}">Copiar</button>
      </div>
      <div class="credential">
        <span>Senha: <b>${escapeHtml(data.password)}</b></span>
        <button type="button" data-copy="${escapeHtml(data.password)}">Copiar</button>
      </div>
      <small>Por segurança, a senha não será exibida novamente.</small>
    `;

    $("#generated").classList.remove("hidden");
    createForm.reset();
    await loadUsers();

  } catch (err) {
    $("#create-error").textContent = err.message;
  }
});

// =========================
// AÇÕES DOS USUÁRIOS
// =========================

$("#users-body").addEventListener("click", async e => {
  const b = e.target.closest("button[data-action]");
  if (!b) return;

  const id = b.dataset.id;
  const action = b.dataset.action;

  if (action === "delete" &&
      !confirm("Excluir este usuário permanentemente?")) return;

  try {
    if (action === "delete") {
      await api(`/api/admin/users/${id}`, { method: "DELETE" });
    } else if (action === "toggle") {
      await api(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "toggle" })
      });
    } else {
      await api(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "renew", days: 30 })
      });
    }

    $("#notice").textContent = "Alteração realizada.";
    await loadUsers();

  } catch (err) {
    $("#notice").textContent = err.message;
  }
});

// =========================
// COPIAR DADOS
// =========================

$("#generated").addEventListener("click", async e => {
  const b = e.target.closest("[data-copy]");
  if (!b) return;

  try {
    await navigator.clipboard.writeText(b.dataset.copy);
    b.textContent = "Copiado!";
  } catch {
    $("#create-error").textContent = "Não foi possível copiar automaticamente.";
  }
});

$("#search").addEventListener("input", renderUsers);

// =========================
// ÁREA DE JOGOS
// =========================

function createGamesArea() {
  if ($("#games-manager")) return;

  const section = document.createElement("section");
  section.id = "games-manager";
  section.className = "panel";

  section.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">CATÁLOGO</p>
        <h2>Adicionar jogo</h2>
        <p class="muted">Envie o ZIP com o emulador e a ROM.</p>
      </div>
    </div>

    <form id="game-form" class="create-form">
      <label class="wide">
        Nome do jogo
        <input name="name" required maxlength="100"
          placeholder="Ex.: Aladdin">
      </label>

      <label>
        Console
        <select name="console" required>
          <option value="SNES">Super Nintendo</option>
          <option value="PS1">PlayStation 1</option>
          <option value="PS2">PlayStation 2</option>
          <option value="MEGA-DRIVE">Mega Drive</option>
          <option value="GBA">Game Boy Advance</option>
        </select>
      </label>

      <label>
        Arquivo ZIP
        <input type="file" name="zip" accept=".zip,application/zip" required>
      </label>

      <button class="primary" type="submit">ENVIAR E PUBLICAR JOGO</button>
    </form>

    <p id="game-message" class="notice" role="status"></p>

    <div class="security-note">
      <p>Destino: <b>pages/jogos-online/</b></p>
      <p>O ZIP deve conter o index.html do emulador e a ROM do jogo.</p>
    </div>
  `;

  $("#seguranca").before(section);

  const nav = document.querySelector(".sidebar nav");
  if (nav && !nav.querySelector('[href="#games-manager"]')) {
    const link = document.createElement("a");
    link.href = "#games-manager";
    link.textContent = "🎮  Jogos";
    nav.appendChild(link);
  }

  $("#game-form").addEventListener("submit", uploadGame);
}

async function uploadGame(e) {
  e.preventDefault();

  const form = e.currentTarget;
  const message = $("#game-message");
  const button = form.querySelector('button[type="submit"]');
  const data = new FormData(form);

  const file = data.get("zip");
  const name = data.get("name").trim();

  if (!file || !file.name.toLowerCase().endsWith(".zip")) {
    message.textContent = "Selecione um arquivo ZIP válido.";
    return;
  }

  const safeName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!safeName) {
    message.textContent = "Digite um nome válido para o jogo.";
    return;
  }

  data.set("folder", safeName);

  button.disabled = true;
  button.textContent = "ENVIANDO...";
  message.textContent = "Preparando envio dos arquivos...";

  try {
    const result = await api("/api/admin/games", {
      method: "POST",
      body: data
    });

    message.textContent =
      result.message || "Jogo enviado com sucesso!";

    if (result.url) {
      message.textContent += " Link: " + result.url;
    }

    form.reset();

  } catch (err) {
    message.textContent = err.message;
  } finally {
    button.disabled = false;
    button.textContent = "ENVIAR E PUBLICAR JOGO";
  }
}

// =========================
// SESSÃO
// =========================

(async () => {
  try {
    await api("/api/admin/me");
    showApp();
    createGamesArea();
    await loadUsers();
  } catch {
    showLogin();
  }
})();

if (loginForm) {
  const originalShowApp = showApp;
  // A área de jogos também aparece depois do login.
  loginForm.addEventListener("submit", () => {
    setTimeout(() => {
      if (!app.classList.contains("hidden")) {
        createGamesArea();
      }
    }, 500);
  });
}

