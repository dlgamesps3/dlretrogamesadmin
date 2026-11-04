
const $ = (s) => document.querySelector(s);

const loginScreen = $("#login-screen");
const app = $("#app");

let users = [];

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;

  const response = await fetch(path, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    },
    credentials: "same-origin"
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Ocorreu um erro.");
  }

  return data;
}

function showApp() {
  loginScreen.classList.add("hidden");
  app.classList.remove("hidden");
  createGamesArea();
}

function showLogin() {
  app.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function dateLabel(date) {
  if (!date) return "Sem validade";
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? "Sem validade"
    : parsed.toLocaleDateString("pt-BR");
}

function statusOf(user) {
  if (user.blocked) return "Bloqueado";
  if (user.expiresAt && new Date(user.expiresAt) < new Date()) {
    return "Expirado";
  }
  return "Ativo";
}

function createGamesArea() {
  if ($("#games-panel")) return;

  const security = $("#seguranca");
  if (!security) return;

  const panel = document.createElement("section");
  panel.id = "games-panel";
  panel.className = "panel";

  panel.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">CATÁLOGO</p>
        <h2>Adicionar jogo</h2>
        <p class="muted">
          Cadastre o download, o jogo online ou os dois juntos.
        </p>
      </div>
    </div>

    <form id="game-form" class="create-form">
      <label class="wide">
        Nome do jogo
        <input name="name" required
          placeholder="Ex.: Super Mario World">
      </label>

      <label>
        Console
        <select name="console" required>
          <option value="SNES">Super Nintendo (SNES)</option>
          <option value="PS1">PlayStation 1</option>
          <option value="PS2">PlayStation 2</option>
          <option value="Mega Drive">Mega Drive</option>
          <option value="GBA">Game Boy Advance</option>
          <option value="NES">Nintendo (NES)</option>
        </select>
      </label>

      <label>
        Capa do jogo
        <input name="cover" type="file"
          accept="image/png,image/jpeg,image/webp">
      </label>

      <div class="wide">
        <p class="eyebrow">OPÇÕES DE PUBLICAÇÃO</p>
      </div>

      <label class="wide">
        Link para download (opcional)
        <input name="downloadUrl" type="url"
          placeholder="https://...">
      </label>

      <label class="wide">
        ZIP para jogar online (opcional)
        <input name="zip" type="file" accept=".zip,application/zip">
      </label>

      <p class="muted wide">
        Você pode preencher somente o download, somente o ZIP
        ou os dois. Para publicar online, o ZIP deve conter
        o index.html e a ROM do jogo.
      </p>

      <button class="primary wide" type="submit">
        PUBLICAR JOGO
      </button>
    </form>

    <div id="game-result" class="generated hidden"
      aria-live="polite"></div>
    <p id="game-error" class="error" role="alert"></p>
  `;

  security.insertAdjacentElement("afterend", panel);

  $("#game-form").addEventListener("submit", uploadGame);
}

async function uploadGame(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const result = $("#game-result");
  const error = $("#game-error");

  error.textContent = "";
  result.classList.add("hidden");

  const name = form.elements.name.value.trim();
  const downloadUrl = form.elements.downloadUrl.value.trim();
  const zip = form.elements.zip.files[0];
  const cover = form.elements.cover.files[0];

  if (!downloadUrl && !zip) {
    error.textContent =
      "Informe um link de download ou selecione um ZIP para jogar online.";
    return;
  }

  if (downloadUrl && !/^https?:\/\//i.test(downloadUrl)) {
    error.textContent = "Informe um link de download válido.";
    return;
  }

  if (zip && !zip.name.toLowerCase().endsWith(".zip")) {
    error.textContent = "Selecione um arquivo ZIP.";
    return;
  }

  const data = new FormData();
  data.append("name", name);
  data.append("console", form.elements.console.value);

  if (downloadUrl) data.append("downloadUrl", downloadUrl);
  if (zip) data.append("zip", zip);
  if (cover) data.append("cover", cover);

  button.disabled = true;
  button.textContent = "ENVIANDO...";

  try {
    const response = await api("/api/admin/games", {
      method: "POST",
      body: data
    });

    result.innerHTML = `
      <strong>Jogo enviado!</strong>
      ${response.onlineUrl ? `
        <p>Jogar online:
          <a href="${escapeHtml(response.onlineUrl)}" target="_blank">
            ${escapeHtml(response.onlineUrl)}
          </a>
        </p>` : ""}
      ${response.downloadUrl ? `
        <p>Download:
          <a href="${escapeHtml(response.downloadUrl)}" target="_blank">
            Abrir link de download
          </a>
        </p>` : ""}
    `;

    result.classList.remove("hidden");
    form.reset();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    button.disabled = false;
    button.textContent = "PUBLICAR JOGO";
  }
}

async function loadUsers() {
  try {
    const data = await api("/api/admin/users");
    users = data.users || [];
    renderUsers();
    updateStats();
  } catch (err) {
    $("#users-body").innerHTML =
      `<tr><td colspan="5">${escapeHtml(err.message)}</td></tr>`;
  }
}

function updateStats() {
  $("#total").textContent = users.length;
  $("#vip").textContent = users.filter(u =>
    u.plan === "VIP" && statusOf(u) === "Ativo"
  ).length;
  $("#free").textContent = users.filter(u =>
    u.plan === "GRATIS" && statusOf(u) === "Ativo"
  ).length;
  $("#expired").textContent = users.filter(u =>
    statusOf(u) === "Expirado"
  ).length;
}

function renderUsers() {
  const body = $("#users-body");

  if (!users.length) {
    body.innerHTML =
      '<tr><td colspan="5">Nenhum usuário cadastrado.</td></tr>';
    return;
  }

  body.innerHTML = users.map(user => `
    <tr>
      <td>
        <strong>${escapeHtml(user.username)}</strong>
        ${user.note ? `<br><small>${escapeHtml(user.note)}</small>` : ""}
      </td>
      <td>${escapeHtml(user.plan)}</td>
      <td>${escapeHtml(dateLabel(user.expiresAt))}</td>
      <td>${escapeHtml(statusOf(user))}</td>
      <td>
        <div class="actions">
          <button data-action="toggle" data-id="${escapeHtml(user.id)}">
            ${user.blocked ? "Liberar" : "Bloquear"}
          </button>
          <button data-action="renew" data-id="${escapeHtml(user.id)}">
            Renovar
          </button>
          <button data-action="delete" data-id="${escapeHtml(user.id)}">
            Excluir
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const error = $("#login-error");
  error.textContent = "";

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.username.value.trim(),
        password: form.password.value
      })
    });

    form.reset();
    showApp();
    await loadUsers();
  } catch (err) {
    error.textContent = err.message;
  }
});

$("#logout").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
  } catch (err) {
    console.error(err);
  }

  showLogin();
});

$("#create-form").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const error = $("#create-error");
  const generated = $("#generated");
  const button = form.querySelector('button[type="submit"]');

  error.textContent = "";
  generated.classList.add("hidden");
  button.disabled = true;

  try {
    const data = await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        plan: form.plan.value,
        days: Number(form.days.value),
        note: form.note.value.trim()
      })
    });

    generated.innerHTML = `
      <strong>Usuário criado!</strong>
      <p>Usuário: ${escapeHtml(data.username)}</p>
      <p>Senha: ${escapeHtml(data.password)}</p>
    `;

    generated.classList.remove("hidden");
    form.reset();
    await loadUsers();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

$("#users-body").addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;

  try {
    if (action === "delete") {
      if (!confirm("Deseja realmente excluir este usuário?")) return;

      await api(`/api/admin/users/${id}`, {
        method: "DELETE"
      });
    } else {
      const body = action === "toggle"
        ? { action: "toggle" }
        : { action: "renew", days: 30 };

      await api(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
    }

    await loadUsers();
  } catch (err) {
    alert(err.message);
  }
});

$("#search").addEventListener("input", event => {
  const term = event.target.value.toLowerCase();

  document.querySelectorAll("#users-body tr").forEach(row => {
    row.style.display =
      row.textContent.toLowerCase().includes(term) ? "" : "none";
  });
});

async function checkSession() {
  try {
    await api("/api/admin/me");
    showApp();
    await loadUsers();
  } catch {
    showLogin();
  }
}

checkSession();
