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

  const responseText = await response.text();

  let data = {};

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const serverError =
      data.error ||
      data.message ||
      data.detail ||
      "";

    const errorMessage = serverError
      ? String(serverError)
      : responseText
        ? `Resposta do servidor: ${responseText.slice(0, 500)}`
        : `Erro HTTP ${response.status}: ${response.statusText || "Falha na solicitação."}`;

    throw new Error(
      `HTTP ${response.status}: ${errorMessage}`
    );
  }

  if (!responseText) {
    return {};
  }

  if (!Object.keys(data).length && responseText) {
    throw new Error(
      `O servidor retornou uma resposta inválida: ${responseText.slice(0, 500)}`
    );
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

/* =====================================
   ÁREA DE CADASTRO DE JOGOS
===================================== */

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
          Envie a ROM diretamente. O sistema cria automaticamente
          a página do emulador e a página de apresentação do jogo.
        </p>
      </div>
    </div>

    <form id="game-form" class="create-form">

      <label class="wide">
        Nome do jogo
        <input
          name="name"
          type="text"
          required
          maxlength="100"
          placeholder="Ex.: Super Mario World"
        >
      </label>

      <label>
        Console
        <select name="console" required>
          <option value="SNES">Super Nintendo (SNES)</option>
          <option value="GBA">Game Boy Advance (GBA)</option>
          <option value="GBC">Game Boy Color (GBC)</option>
          <option value="GB">Game Boy (GB)</option>
          <option value="NES">Nintendo (NES)</option>
          <option value="Mega-Drive">Mega Drive</option>
          <option value="PS1">PlayStation 1</option>
        </select>
      </label>

      <label>
        Capa do jogo
        <input
          name="cover"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        >
      </label>

      <label class="wide">
        Descrição do jogo
        <textarea
          name="description"
          rows="5"
          maxlength="3000"
          placeholder="A descrição será criada automaticamente."
        ></textarea>
      </label>

      <div class="wide">
        <p class="eyebrow">ARQUIVO DO JOGO</p>
      </div>

      <label class="wide">
        Arquivo da ROM
        <input
          name="rom"
          type="file"
          required
          accept=".sfc,.smc,.nes,.gba,.gbc,.gb,.md,.gen,.bin,.iso"
        >
      </label>

      <p class="muted wide">
        Selecione a ROM original do jogo. Não precisa enviar ZIP
        nem criar index.html manualmente. O sistema gera o emulador
        automaticamente.
      </p>

      <div class="wide">
        <p class="eyebrow">DOWNLOAD OPCIONAL</p>
      </div>

      <label class="wide">
        Link para download
        <input
          name="downloadUrl"
          type="url"
          placeholder="https://..."
        >
      </label>

      <button class="primary wide" type="submit">
        PUBLICAR JOGO
      </button>

    </form>

    <div
      id="game-result"
      class="generated hidden"
      aria-live="polite"
    ></div>

    <p id="game-error" class="error" role="alert"></p>
  `;

  security.insertAdjacentElement("afterend", panel);

  $("#game-form").addEventListener("submit", uploadGame);
}

/* =====================================
   ENVIO DA ROM
===================================== */

async function uploadGame(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const result = $("#game-result");
  const error = $("#game-error");

  error.textContent = "";
  result.classList.add("hidden");
  result.innerHTML = "";

  const name = form.elements.name.value.trim();
  const consoleName = form.elements.console.value;
  const description = form.elements.description.value.trim();
  const downloadUrl = form.elements.downloadUrl.value.trim();
  const rom = form.elements.rom.files[0];
  const cover = form.elements.cover.files[0];

  if (!name) {
    error.textContent = "Informe o nome do jogo.";
    return;
  }

  if (!rom) {
    error.textContent = "Selecione o arquivo da ROM.";
    return;
  }

  if (rom.size === 0) {
    error.textContent = "O arquivo da ROM está vazio.";
    return;
  }

  if (rom.size > 50 * 1024 * 1024) {
    error.textContent = "A ROM ultrapassa o limite de 50 MB.";
    return;
  }

  if (downloadUrl && !/^https?:\/\//i.test(downloadUrl)) {
    error.textContent = "Informe um link de download válido.";
    return;
  }

  if (description.length > 3000) {
    error.textContent = "A descrição ultrapassa 3000 caracteres.";
    return;
  }

  const extension = "." + rom.name.split(".").pop().toLowerCase();

  const allowedExtensions = {
    "SNES": [".sfc", ".smc"],
    "GBA": [".gba"],
    "GBC": [".gbc"],
    "GB": [".gb"],
    "NES": [".nes"],
    "Mega-Drive": [".md", ".gen", ".bin"],
    "PS1": [".iso", ".bin"]
  };

  const allowed = allowedExtensions[consoleName] || [];

  if (!allowed.includes(extension)) {
    error.textContent =
      `O arquivo ${extension} não corresponde ao console selecionado.`;
    return;
  }

  if (cover && cover.size > 8 * 1024 * 1024) {
    error.textContent = "A capa ultrapassa o limite de 8 MB.";
    return;
  }

  if (cover) {
    const allowedCoverTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedCoverTypes.includes(cover.type)) {
      error.textContent = "A capa precisa ser JPG, PNG ou WEBP.";
      return;
    }
  }

  const data = new FormData();

  data.append("name", name);
  data.append("console", consoleName);
  data.append("description", description);
  data.append("rom", rom);

  if (downloadUrl) {
    data.append("downloadUrl", downloadUrl);
  }

  if (cover) {
    data.append("cover", cover);
  }

  button.disabled = true;
  button.textContent = "PUBLICANDO JOGO...";

  try {
    const response = await api("/api/admin/games", {
      method: "POST",
      body: data
    });

    result.innerHTML = `
      <strong>JOGO PUBLICADO COM SUCESSO!</strong>

      <p>Nome: ${escapeHtml(response.name || name)}</p>
      <p>Console: ${escapeHtml(response.console || consoleName)}</p>
      <p>ROM: ${escapeHtml(response.rom || rom.name)}</p>

      ${
        response.description
          ? `<p>Descrição: ${escapeHtml(response.description)}</p>`
          : ""
      }

      ${
        response.pageUrl
          ? `<p>Página do jogo:
              <a href="${escapeHtml(response.pageUrl)}" target="_blank" rel="noopener">
                ABRIR PÁGINA
              </a>
            </p>`
          : ""
      }

      ${
        response.onlineUrl
          ? `<p>Jogar online:
              <a href="${escapeHtml(response.onlineUrl)}" target="_blank" rel="noopener">
                ABRIR EMULADOR
              </a>
            </p>`
          : ""
      }

      ${
        response.downloadUrl
          ? `<p>Download:
              <a href="${escapeHtml(response.downloadUrl)}" target="_blank" rel="noopener">
                ABRIR LINK
              </a>
            </p>`
          : ""
      }

      <p>${escapeHtml(response.message || "Jogo publicado!")}</p>
    `;

    result.classList.remove("hidden");
    form.reset();

  } catch (err) {
    error.textContent = `Falha ao publicar: ${err.message}`;
    console.error("Erro ao publicar jogo:", err);

  } finally {
    button.disabled = false;
    button.textContent = "PUBLICAR JOGO";
  }
}

/* =====================================
   CARREGAR USUÁRIOS
===================================== */

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

/* =====================================
   ESTATÍSTICAS
===================================== */

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

/* =====================================
   LISTA DE USUÁRIOS
===================================== */

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

/* =====================================
   LOGIN
===================================== */

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

/* =====================================
   SAIR DO PAINEL
===================================== */

$("#logout").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", {
      method: "POST"
    });
  } catch (err) {
    console.error(err);
  }

  showLogin();
});

/* =====================================
   GERAR USUÁRIO
===================================== */

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

/* =====================================
   AÇÕES DOS USUÁRIOS
===================================== */

$("#users-body").addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");

  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;

  try {
    if (action === "delete") {
      if (!confirm("Deseja realmente excluir este usuário?")) {
        return;
      }

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

/* =====================================
   PESQUISA DE USUÁRIOS
===================================== */

$("#search").addEventListener("input", event => {
  const term = event.target.value.toLowerCase();

  document.querySelectorAll("#users-body tr").forEach(row => {
    row.style.display =
      row.textContent.toLowerCase().includes(term)
        ? ""
        : "none";
  });
});

/* =====================================
   VERIFICAR SESSÃO
===================================== */

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
