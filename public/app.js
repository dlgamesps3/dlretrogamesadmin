
const $ = (selector) => document.querySelector(selector);

const loginScreen = $("#login-screen");
const loginForm = $("#login-form");
const loginError = $("#login-error");
const app = $("#app");

let users = [];
let coverPreviewUrl = null;
let descriptionManuallyEdited = false;

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
    throw new Error(data.error || `Erro HTTP ${response.status}`);
  }

  return data;
}

/* =========================
   LOGIN
========================= */

function showApp() {
  loginScreen.classList.add("hidden");
  app.classList.remove("hidden");
}

function showLogin() {
  app.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  loginError.textContent = "";

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
    await loadDashboard();

  } catch (error) {
    loginError.textContent = error.message;
  }
});

$("#logout-button")?.addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
  } catch (error) {
    console.error(error);
  }

  showLogin();
});

/* =========================
   VERIFICAR SESSÃO
========================= */

async function checkSession() {
  try {
    await api("/api/admin/me");
    showApp();
    await loadDashboard();
  } catch {
    showLogin();
  }
}

/* =========================
   MENU LATERAL
========================= */

const panelTitles = {
  dashboard: "Dashboard",
  users: "Usuários",
  create: "Criar usuário",
  games: "Publicar jogo"
};

function openPanel(target) {
  document.querySelectorAll("[data-view]").forEach(section => {
    section.classList.toggle(
      "hidden",
      section.dataset.view !== target
    );
  });

  document.querySelectorAll("[data-panel]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.panel === target
    );
  });

  const title = $("#page-title");
  if (title) title.textContent = panelTitles[target] || "Administração";

  if (target === "dashboard") loadDashboard();
  if (target === "users") loadUsers();
}

document.querySelectorAll("[data-panel]").forEach(button => {
  button.addEventListener("click", () => {
    openPanel(button.dataset.panel);
  });
});

/* =========================
   DASHBOARD
========================= */

async function loadDashboard() {
  try {
    const data = await api("/api/admin/users");

    users = Array.isArray(data) ? data : (data.users || []);

    const total = users.length;
    const vip = users.filter(u =>
      String(u.plan || "").toLowerCase() === "vip"
    ).length;

    const free = users.filter(u =>
      String(u.plan || "").toLowerCase() === "free"
    ).length;

    const expired = users.filter(u => {
      const date = u.expiresAt || u.expires_at || u.expiration;
      return date && new Date(date).getTime() < Date.now();
    }).length;

    $("#total").textContent = total;
    $("#vip").textContent = vip;
    $("#free").textContent = free;
    $("#expired").textContent = expired;

  } catch (error) {
    console.error("Erro no dashboard:", error);
  }
}

/* =========================
   USUÁRIOS
========================= */

async function loadUsers() {
  const tbody = $("#users-body");
  tbody.innerHTML = "<tr><td colspan='4'>Carregando...</td></tr>";

  try {
    const data = await api("/api/admin/users");

    users = Array.isArray(data) ? data : (data.users || []);

    renderUsers(users);

  } catch (error) {
    tbody.innerHTML = "";

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 4;
    cell.textContent = error.message;

    row.appendChild(cell);
    tbody.appendChild(row);
  }
}

function renderUsers(list) {
  const tbody = $("#users-body");
  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = "<tr><td colspan='4'>Nenhum usuário encontrado.</td></tr>";
    return;
  }

  list.forEach(user => {
    const id = user.id;
    const username = user.username || user.user || "Sem nome";
    const plan = user.plan || "free";
    const expiration = user.expiresAt ||
      user.expires_at ||
      user.expiration ||
      "Não informado";

    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = username;

    const planCell = document.createElement("td");
    planCell.textContent = String(plan).toUpperCase();

    const dateCell = document.createElement("td");
    dateCell.textContent = expiration;

    const actionsCell = document.createElement("td");

    const toggleButton = document.createElement("button");
    toggleButton.textContent = "Alternar";
    toggleButton.type = "button";

    toggleButton.addEventListener("click", async () => {
      await updateUser(id, { action: "toggle" });
    });

    const renewButton = document.createElement("button");
    renewButton.textContent = "Renovar";
    renewButton.type = "button";

    renewButton.addEventListener("click", async () => {
      await updateUser(id, { action: "renew", days: 30 });
    });

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Excluir";
    deleteButton.type = "button";

    deleteButton.addEventListener("click", async () => {
      if (!confirm(`Excluir o usuário ${username}?`)) return;

      try {
        await api(`/api/admin/users/${encodeURIComponent(id)}`, {
          method: "DELETE"
        });

        await loadUsers();
        await loadDashboard();

      } catch (error) {
        alert(error.message);
      }
    });

    actionsCell.append(toggleButton, renewButton, deleteButton);
    row.append(nameCell, planCell, dateCell, actionsCell);
    tbody.appendChild(row);
  });
}

async function updateUser(id, body) {
  try {
    await api(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });

    await loadUsers();
    await loadDashboard();

  } catch (error) {
    alert(error.message);
  }
}

$("#search")?.addEventListener("input", event => {
  const query = event.target.value.toLowerCase();

  const filtered = users.filter(user =>
    String(user.username || user.user || "")
      .toLowerCase()
      .includes(query)
  );

  renderUsers(filtered);
});

/* =========================
   CRIAR USUÁRIO
========================= */

$("#create-form")?.addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const errorBox = $("#create-error");
  const generated = $("#generated");

  errorBox.textContent = "";
  generated.textContent = "";

  const formData = new FormData(form);

  try {
    const result = await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        plan: formData.get("plan"),
        days: Number(formData.get("days")),
        note: formData.get("note")
      })
    });

    generated.textContent = result.username
      ? `Usuário criado: ${result.username}`
      : "Usuário criado com sucesso!";

    form.reset();

    await loadDashboard();

  } catch (error) {
    errorBox.textContent = error.message;
  }
});

/* =========================
   DESCRIÇÃO AUTOMÁTICA
========================= */

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function generateDescription(name, consoleName) {
  for (const language of ["pt", "en"]) {
    try {
      const searchUrl = new URL(
        `https://${language}.wikipedia.org/w/api.php`
      );

      searchUrl.search = new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: `${name} video game`,
        format: "json",
        origin: "*",
        srlimit: "5"
      }).toString();

      const response = await fetch(searchUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000)
      });

      if (!response.ok) continue;

      const data = await response.json();
      const results = data?.query?.search || [];

      if (!results.length) continue;

      const normalizedName = slugify(name);

      const result = results.find(item => {
        const title = slugify(item.title);
        return title.includes(normalizedName) ||
          normalizedName.includes(title);
      }) || results[0];

      const pageUrl = new URL(
        `https://${language}.wikipedia.org/w/api.php`
      );

      pageUrl.search = new URLSearchParams({
        action: "query",
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        exchars: "700",
        pageids: String(result.pageid),
        format: "json",
        origin: "*"
      }).toString();

      const pageResponse = await fetch(pageUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000)
      });

      if (!pageResponse.ok) continue;

      const pageData = await pageResponse.json();

      const page = Object.values(
        pageData?.query?.pages || {}
      )[0];

      const extract = String(page?.extract || "")
        .replace(/\s+/g, " ")
        .trim();

      if (extract.length < 40) continue;

      const sentences = extract.match(/[^.!?]+[.!?]+/g) || [extract];

      let summary = "";

      for (const sentence of sentences) {
        const clean = sentence.trim();

        if ((summary + " " + clean).trim().length > 150) break;

        summary = (summary + " " + clean).trim();
      }

      if (summary.length >= 40) return summary;

    } catch {
      continue;
    }
  }

  return `${name}: um clássico de ${consoleName} para jogar no DL RETRO GAMES.`.slice(0, 150);
}

const gameNameInput = $("#game-name");
const gameConsoleInput = $("#game-console");
const descriptionInput = $("#game-description");

let descriptionRequest = 0;

async function updateAutomaticDescription() {
  const name = gameNameInput?.value.trim();
  const consoleName = gameConsoleInput?.value;

  if (!name || !consoleName || descriptionManuallyEdited) return;

  const requestId = ++descriptionRequest;

  descriptionInput.placeholder = "Gerando descrição...";

  const description = await generateDescription(name, consoleName);

  if (requestId !== descriptionRequest) return;

  if (!descriptionManuallyEdited) {
    descriptionInput.value = description;
  }

  descriptionInput.placeholder = "Descrição automática ou personalizada...";
}

gameNameInput?.addEventListener("blur", updateAutomaticDescription);
gameConsoleInput?.addEventListener("change", updateAutomaticDescription);

descriptionInput?.addEventListener("input", () => {
  descriptionManuallyEdited = true;
});

/* =========================
   PRÉVIA DA CAPA
========================= */

const coverInput = $("#game-cover");
const coverImage = $("#cover-image");
const coverPreview = $("#cover-preview");
const removeCoverButton = $("#remove-cover");

function clearCoverPreview() {
  if (coverPreviewUrl) {
    URL.revokeObjectURL(coverPreviewUrl);
    coverPreviewUrl = null;
  }

  coverImage.removeAttribute("src");
  coverPreview.classList.add("hidden");
}

coverInput?.addEventListener("change", () => {
  const file = coverInput.files?.[0];

  clearCoverPreview();

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Selecione um arquivo de imagem válido.");
    coverInput.value = "";
    return;
  }

  coverPreviewUrl = URL.createObjectURL(file);
  coverImage.src = coverPreviewUrl;
  coverPreview.classList.remove("hidden");
});

removeCoverButton?.addEventListener("click", () => {
  coverInput.value = "";
  clearCoverPreview();
});

/* =========================
   PUBLICAR JOGO
========================= */

$("#game-form")?.addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const errorBox = $("#game-error");
  const resultBox = $("#game-result");
  const button = $("#publish-button");

  errorBox.textContent = "";
  resultBox.textContent = "";

  const formData = new FormData(form);

  if (!formData.get("name") || !formData.get("console")) {
    errorBox.textContent = "Preencha o nome e o console.";
    return;
  }

  if (!formData.get("rom")?.size) {
    errorBox.textContent = "Selecione o arquivo ROM.";
    return;
  }

  if (!formData.get("cover")?.size) {
    errorBox.textContent = "Selecione a capa do jogo.";
    return;
  }

  button.disabled = true;
  button.textContent = "PUBLICANDO...";

  try {
    const result = await api("/api/admin/games", {
      method: "POST",
      body: formData
    });

    resultBox.textContent =
      result.message || "Jogo publicado com sucesso!";

    if (result.pageUrl) {
      const link = document.createElement("a");
      link.href = result.pageUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Abrir página do jogo";
      resultBox.appendChild(document.createElement("br"));
      resultBox.appendChild(link);
    }

    form.reset();
    clearCoverPreview();
    descriptionManuallyEdited = false;

  } catch (error) {
    errorBox.textContent = `Falha ao publicar: ${error.message}`;

  } finally {
    button.disabled = false;
    button.textContent = "PUBLICAR JOGO";
  }
});

/* =========================
   INICIAR
========================= */

checkSession();
