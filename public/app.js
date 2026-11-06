
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

  if (title) {
    title.textContent = panelTitles[target] || "Administração";
  }

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

function getPlan(user) {
  return String(user.plan || "").toUpperCase();
}

async function loadDashboard() {
  try {
    const data = await api("/api/admin/users");

    users = Array.isArray(data) ? data : (data.users || []);

    const total = users.length;

    const vip = users.filter(user =>
      getPlan(user) === "VIP"
    ).length;

    const free = users.filter(user =>
      getPlan(user) !== "VIP"
    ).length;

    const expired = users.filter(user => {
      const date = user.expiresAt ||
        user.expires_at ||
        user.expiration;

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

function getUserName(user) {
  const note = String(user.note || "");
  const match = note.match(/^Nome:\s*(.*)$/i);

  return match ? match[1].trim() : "";
}

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
    tbody.innerHTML =
      "<tr><td colspan='4'>Nenhum usuário encontrado.</td></tr>";
    return;
  }

  list.forEach(user => {
    const id = user.id;
    const username = user.username || user.user || "Sem usuário";
    const personName = getUserName(user);
    const plan = getPlan(user) || "GRATIS";

    const expiration = user.expires_at ||
      user.expiresAt ||
      user.expiration ||
      "Não informado";

    const row = document.createElement("tr");

    const nameCell = document.createElement("td");

    if (personName) {
      const name = document.createElement("strong");
      name.textContent = personName;

      const usernameLine = document.createElement("small");
      usernameLine.textContent = username;
      usernameLine.style.display = "block";
      usernameLine.style.opacity = "0.7";

      nameCell.append(name, usernameLine);
    } else {
      nameCell.textContent = username;
    }

    const planCell = document.createElement("td");
    planCell.textContent = plan;

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

  const filtered = users.filter(user => {
    const username = String(user.username || user.user || "");
    const name = getUserName(user);

    return username.toLowerCase().includes(query) ||
      name.toLowerCase().includes(query);
  });

  renderUsers(filtered);
});

/* =========================
   CRIAR USUÁRIO
========================= */

const createForm = $("#create-form");
const userMode = $("#user-mode");
const manualFields = $("#manual-fields");
const usernameInput = $("#new-username");
const passwordInput = $("#new-password");
const generatedBox = $("#generated");

function updateCreationMode() {
  const manual = userMode?.value === "manual";

  manualFields?.classList.toggle("hidden", !manual);

  if (usernameInput) usernameInput.required = manual;
  if (passwordInput) passwordInput.required = manual;
}

userMode?.addEventListener("change", updateCreationMode);

updateCreationMode();

async function copyCredentials(username, password) {
  const text = `Nome: ${$("#user-name").value.trim()}
Usuário: ${username}
Senha: ${password}`;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const temporary = document.createElement("textarea");

      temporary.value = text;
      temporary.style.position = "fixed";
      temporary.style.opacity = "0";

      document.body.appendChild(temporary);
      temporary.select();

      const copied = document.execCommand("copy");

      temporary.remove();

      if (!copied) throw new Error("Não foi possível copiar.");
    }

    alert("Usuário e senha copiados!");

  } catch (error) {
    alert("Não foi possível copiar automaticamente. Copie os dados manualmente.");
  }
}

function showCreatedUser(result) {
  generatedBox.innerHTML = "";

  const card = document.createElement("div");

  card.style.marginTop = "18px";
  card.style.padding = "16px";
  card.style.border = "1px solid #00d9ff";
  card.style.borderRadius = "10px";
  card.style.background = "#07182b";

  const title = document.createElement("h3");
  title.textContent = "Usuário criado com sucesso!";

  const name = document.createElement("p");
  name.textContent = `Nome: ${result.name}`;

  const username = document.createElement("p");
  username.textContent = `Usuário: ${result.username}`;

  const password = document.createElement("p");
  password.textContent = `Senha: ${result.password}`;

  const plan = document.createElement("p");
  plan.textContent = `Plano: ${result.plan}`;

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "primary";
  copyButton.textContent = "📋 COPIAR USUÁRIO E SENHA";

  copyButton.addEventListener("click", () => {
    copyCredentials(result.username, result.password);
  });

  card.append(title, name, username, password, plan, copyButton);

  generatedBox.appendChild(card);
}

createForm?.addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const errorBox = $("#create-error");
  const button = $("#create-button");

  errorBox.textContent = "";
  generatedBox.innerHTML = "";

  const formData = new FormData(form);

  const body = {
    name: String(formData.get("name") || "").trim(),
    mode: formData.get("mode"),
    plan: formData.get("plan"),
    days: Number(formData.get("days"))
  };

  if (body.mode === "manual") {
    body.username = String(formData.get("username") || "").trim();
    body.password = String(formData.get("password") || "");
  }

  if (!body.name) {
    errorBox.textContent = "Informe o nome da pessoa.";
    return;
  }

  button.disabled = true;
  button.textContent = "CRIANDO...";

  try {
    const result = await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(body)
    });

    showCreatedUser(result);

    form.reset();
    updateCreationMode();

    await loadDashboard();
    await loadUsers();

  } catch (error) {
    errorBox.textContent = error.message;

  } finally {
    button.disabled = false;
    button.textContent = "CRIAR USUÁRIO";
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

  coverImage?.removeAttribute("src");
  coverPreview?.classList.add("hidden");
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
