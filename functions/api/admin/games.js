
import { requireAdmin, json } from "../../_lib/security.js";

const OWNER = "dlgamesps3";
const REPO = "dlretrogames";
const BRANCH = "main";
const SITE_URL = "https://dlretrogames.pages.dev";
const ADMIN_URL = "https://dlretrogamesadmin.pages.dev";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ROM_EXTENSIONS = [
  ".sfc", ".smc", ".nes", ".gba", ".gbc",
  ".gb", ".md", ".gen", ".bin", ".iso"
];

function slugify(value) {
  return String(value || "jogo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 70);
}

function limitDescription(text) {
  text = String(text || "").replace(/\s+/g, " ").trim();

  if (text.length <= 150) return text;

  let shortened = text.slice(0, 147);
  shortened = shortened.replace(/\s+\S*$/, "");

  return shortened.trimEnd() + "...";
}

function migrateUrl(url) {
  if (!url) return "";

  const oldPrefix = `https://${OWNER}.github.io/${REPO}`;
  const value = String(url).trim();

  if (value.startsWith(oldPrefix)) {
    return SITE_URL + value.slice(oldPrefix.length);
  }

  return value;
}

function migrateGame(game) {
  const migrated = {
    ...game,
    onlineUrl: migrateUrl(game.onlineUrl),
    pageUrl: migrateUrl(game.pageUrl),
    coverUrl: migrateUrl(game.coverUrl)
  };

  const consoleName = normalizeConsole(migrated.console);
  const slug = slugify(migrated.slug || migrated.name);

  if (!migrated.onlineUrl) {
    migrated.onlineUrl =
      `${SITE_URL}/pages/jogos-online/${consoleName}/${slug}/`;
  }

  if (!migrated.pageUrl) {
    migrated.pageUrl =
      `${SITE_URL}/pages/jogos/${consoleName}/${slug}.html`;
  }

  if (!migrated.coverUrl) {
    migrated.coverUrl =
      `${SITE_URL}/img/capas/sem-capa.jpg`;
  }

  return migrated;
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

      const normalizedName = slugify(name).replace(/_/g, "");

      const result = results.find(item => {
        const title = slugify(item.title).replace(/_/g, "");

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
        exchars: "1000",
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
        if ((summary + sentence).length > 300) break;
        summary += sentence.trim() + " ";
      }

      summary = summary.trim();

      if (summary.length >= 40) {
        return limitDescription(summary);
      }

    } catch (error) {
      continue;
    }
  }

  return limitDescription(
    `${name} é um jogo de ${consoleName}. Reviva esse clássico dos videogames e aproveite essa experiência retrô no DL RETRO GAMES.`
  );
}

function normalizeConsole(value) {
  const text = String(value || "").toLowerCase();

  if (text.includes("snes") || text.includes("super nintendo")) return "SNES";
  if (text.includes("gba") || text.includes("game boy advance")) return "GBA";
  if (text.includes("gbc") || text.includes("game boy color")) return "GBC";
  if (text.includes("game boy") || text === "gb") return "GB";
  if (text.includes("nes") || text.includes("nintendo")) return "NES";

  if (
    text.includes("mega") ||
    text.includes("genesis") ||
    text.includes("megadrive")
  ) return "Mega-Drive";

  if (text.includes("ps1") || text.includes("playstation")) return "PS1";

  return slugify(value) || "SNES";
}

function getCore(consoleName) {
  const cores = {
    "SNES": "snes9x",
    "GBA": "mgba",
    "GBC": "gambatte",
    "GB": "gambatte",
    "NES": "fceumm",
    "Mega-Drive": "genesis_plus_gx",
    "PS1": "pcsx_rearmed"
  };

  return cores[consoleName] || null;
}

function getExtensions(consoleName) {
  const extensions = {
    "SNES": [".sfc", ".smc"],
    "GBA": [".gba"],
    "GBC": [".gbc"],
    "GB": [".gb"],
    "NES": [".nes"],
    "Mega-Drive": [".md", ".gen", ".bin"],
    "PS1": [".iso", ".bin"]
  };

  return extensions[consoleName] || ROM_EXTENSIONS;
}

function base64(bytes) {
  let binary = "";
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }

  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function safeRomName(filename) {
  const original = String(filename || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop();

  return original
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "");
}

function isRom(filename) {
  const lower = String(filename || "").toLowerCase();
  return ROM_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/* EMULADOR COM ROM PROTEGIDA NO R2 */

function createEmulatorIndex({
  name,
  consoleName,
  r2Key
}) {
  const core = getCore(consoleName);

  const safeName = escapeHtml(name);
  const safeConsole = escapeHtml(consoleName);

  const safeR2Key = JSON.stringify(r2Key)
    .replace(/</g, "\\u003c");

  const safeGameName = JSON.stringify(name)
    .replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeName} - DL RETRO GAMES</title>
<style>
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  min-height: 100%;
  background: #050914;
  color: #fff;
  font-family: Arial, sans-serif;
}
body {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.header {
  width: 100%;
  padding: 15px;
  text-align: center;
  background: #0b1426;
  border-bottom: 1px solid #00d9ff;
}
.header h1 {
  margin: 0;
  color: #00eaff;
  font-size: 22px;
}
.header p {
  margin: 7px 0 0;
  color: #aaa;
  font-size: 13px;
}
#game {
  width: 100%;
  max-width: 1200px;
  min-height: 70vh;
  margin: 15px auto;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}
#loading-message {
  color: #00eaff;
  padding: 25px;
  text-align: center;
}
.footer {
  padding: 15px;
  color: #777;
  font-size: 12px;
  text-align: center;
}
</style>
</head>
<body>
<header class="header">
  <h1>${safeName}</h1>
  <p>${safeConsole} • DL RETRO GAMES</p>
</header>

<div id="game">
  <div id="loading-message">Verificando acesso e carregando jogo...</div>
</div>

<div class="footer">
  DL RETRO GAMES - Jogos clássicos
</div>

<script>
const r2Key = ${safeR2Key};

window.EJS_player = "#game";
window.EJS_core = ${JSON.stringify(core)};
window.EJS_gameName = ${safeGameName};
window.EJS_pathtodata =
  "https://cdn.emulatorjs.org/stable/data/";
window.EJS_startOnLoaded = true;

function showError(message) {
  const game = document.getElementById("game");

  game.innerHTML = "";

  const box = document.createElement("div");
  box.style.cssText =
    "color:#ff7777;padding:25px;text-align:center;font-size:16px;";

  box.textContent = message;
  game.appendChild(box);
}

async function startGame() {
  const token = sessionStorage.getItem("dlrg_customer_token");

  if (!token) {
    throw new Error("Faça login no site para jogar este jogo VIP.");
  }

  const response = await fetch(
    "${ADMIN_URL}/api/rom?key=" + encodeURIComponent(r2Key),
    {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    let message = "Não foi possível carregar a ROM.";

    try {
      const data = await response.json();
      if (data.error) message = data.error;
    } catch (error) {}

    throw new Error(message);
  }

  const blob = await response.blob();

  if (!blob.size) {
    throw new Error("A ROM recebida está vazia.");
  }

  window.EJS_gameUrl = URL.createObjectURL(blob);

  const loader = document.createElement("script");
  loader.src =
    "https://cdn.emulatorjs.org/stable/data/loader.js";

  loader.onerror = function() {
    showError("Erro ao carregar o emulador. Tente novamente.");
  };

  document.body.appendChild(loader);
}

startGame().catch(error => {
  showError(error.message || "Erro ao iniciar o jogo.");
});
</script>
</body>
</html>`;
}

/* PÁGINA DE DETALHES COM DOWNLOAD VIP PELO R2 */

function createGamePage({
  name,
  consoleName,
  onlineUrl,
  coverUrl,
  downloadUrl,
  description,
  r2Key
}) {
  const safeName = escapeHtml(name);
  const safeConsole = escapeHtml(consoleName);
  const safeCover = escapeHtml(
    coverUrl || `${SITE_URL}/img/capas/sem-capa.jpg`
  );
  const safeDownload = escapeHtml(downloadUrl);

  const safeR2Key = JSON.stringify(r2Key || "")
    .replace(/</g, "\\u003c");

  const safeRomFilename = JSON.stringify(
    String(r2Key || "").split("/").pop() || "jogo.rom"
  ).replace(/</g, "\\u003c");

  const finalDescription = limitDescription(
    description ||
    `Conheça ${name}, um clássico do console ${consoleName}. Prepare-se para reviver essa aventura retrô!`
  );

  const safeDescription = escapeHtml(finalDescription);

  let downloadButton = "";

  if (r2Key) {
    downloadButton = `
    <button class="btn download" id="download-button" type="button">
      BAIXAR JOGO
    </button>
    `;
  } else if (downloadUrl) {
    downloadButton = `
    <a class="btn download"
       href="${safeDownload}"
       target="_blank"
       rel="noopener">
      BAIXAR JOGO
    </a>
    `;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeName} - DL RETRO GAMES</title>
<style>
*{box-sizing:border-box}
body{
  margin:0;padding:20px;background:#080b16;color:#fff;
  font-family:Arial,sans-serif;text-align:center
}
.container{max-width:850px;margin:auto}
h1{color:#00eaff;font-size:30px}
.console{color:#aaa;margin-bottom:20px}
.cover{
  width:220px;max-width:85%;border-radius:12px;
  margin:10px auto 20px;display:block;
  object-fit:contain;min-height:100px
}
.description{
  background:#111a2d;border:1px solid #193c55;
  border-radius:12px;padding:20px;margin:20px auto;
  text-align:left;line-height:1.7;color:#ddd
}
.description h2{color:#00eaff;margin-top:0}
.buttons{
  display:flex;gap:12px;justify-content:center;
  flex-wrap:wrap;margin:25px 0
}
.btn{
  display:inline-block;padding:15px 24px;border-radius:8px;
  background:#00d9ff;color:#001018;font-weight:bold;
  text-decoration:none;border:0;cursor:pointer;font-size:15px;
  font-family:Arial,sans-serif
}
.btn.download{background:#00e676}
.btn:disabled{opacity:.6;cursor:wait}
#download-message{
  min-height:22px;
  margin:12px auto;
  color:#00eaff;
  font-size:14px;
}
</style>
</head>
<body>
<div class="container">
  <h1>${safeName}</h1>
  <div class="console">${safeConsole}</div>

  <img class="cover" src="${safeCover}" alt="${safeName}"
       onerror="this.onerror=null;this.src='${SITE_URL}/img/capas/sem-capa.jpg'">

  <section class="description">
    <h2>Sobre o jogo</h2>
    <p>${safeDescription}</p>
  </section>

  <div class="buttons">
    <a class="btn" id="play-button"
       href="${escapeHtml(onlineUrl)}">
      JOGAR ONLINE
    </a>

    ${downloadButton}
  </div>

  <div id="download-message" aria-live="polite"></div>
</div>

<script>
const ROM_KEY = ${safeR2Key};
const ROM_FILENAME = ${safeRomFilename};

const downloadButton = document.getElementById("download-button");
const downloadMessage = document.getElementById("download-message");

if (downloadButton) {
  downloadButton.addEventListener("click", async function() {
    const token = sessionStorage.getItem("dlrg_customer_token");

    if (!token) {
      downloadMessage.textContent =
        "Faça login no site para baixar este jogo VIP.";
      return;
    }

    downloadButton.disabled = true;
    downloadButton.textContent = "VERIFICANDO ACESSO...";
    downloadMessage.textContent = "Preparando seu download...";

    try {
      const response = await fetch(
        "${ADMIN_URL}/api/rom?key=" + encodeURIComponent(ROM_KEY),
        {
          method: "GET",
          headers: {
            Authorization: "Bearer " + token
          },
          cache: "no-store"
        }
      );

      if (!response.ok) {
        let message = "Não foi possível baixar a ROM.";

        try {
          const data = await response.json();
          if (data.error) message = data.error;
        } catch (error) {}

        throw new Error(message);
      }

      const blob = await response.blob();

      if (!blob.size) {
        throw new Error("O arquivo recebido está vazio.");
      }

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = ROM_FILENAME;
      link.style.display = "none";

      document.body.appendChild(link);
      link.click();
      link.remove();

      downloadMessage.textContent =
        "Download iniciado com sucesso!";

      setTimeout(function() {
        URL.revokeObjectURL(objectUrl);
      }, 60000);

    } catch (error) {
      downloadMessage.textContent =
        error.message || "Erro ao baixar o jogo.";
    } finally {
      downloadButton.disabled = false;
      downloadButton.textContent = "BAIXAR JOGO";
    }
  });
}
</script>
</body>
</html>`;
}

function getPagePath(game) {
  if (game.pageUrl) {
    try {
      const url = new URL(migrateUrl(game.pageUrl));
      const path = decodeURIComponent(url.pathname).replace(/^\/+/, "");

      if (path.startsWith("pages/jogos/") && path.endsWith(".html")) {
        return path;
      }
    } catch (error) {
      // Usa o caminho calculado abaixo.
    }
  }

  const consoleName = normalizeConsole(game.console);
  const slug = slugify(game.slug || game.name);

  return `pages/jogos/${consoleName}/${slug}.html`;
}

async function github(path, token, options = {}) {
  const response = await fetch(
    `https://api.github.com${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "DL-RETRO-GAMES",
        ...(options.headers || {})
      }
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Erro ao acessar o GitHub.");
  }

  return data;
}

function validateGitPaths(files) {
  const paths = files.map(file => file.path);
  const seen = new Set();

  for (const path of paths) {
    const normalized = path.toLowerCase();

    if (seen.has(normalized)) {
      throw new Error(`Arquivo duplicado: ${path}`);
    }

    seen.add(normalized);
  }

  const sorted = [...paths].sort();

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i].toLowerCase();

    for (let j = i + 1; j < sorted.length; j++) {
      const next = sorted[j].toLowerCase();

      if (next.startsWith(current + "/")) {
        throw new Error(`Conflito de caminhos: ${sorted[i]}`);
      }
    }
  }
}

/* PUBLICAÇÃO */

export async function onRequestPost({ request, env }) {
  try {
    if (!(await requireAdmin(request, env))) {
      return json({ error: "Não autenticado." }, 401);
    }

    if (!env.GITHUB_TOKEN) {
      return json({
        error: "Configure GITHUB_TOKEN no Cloudflare."
      }, 500);
    }

    if (!env.ROMS) {
      return json({
        error: "Bucket R2 ROMS não está configurado no projeto dlretrogamesadmin."
      }, 500);
    }

    const form = await request.formData();

    const name = String(form.get("name") || "").trim();
    const consoleInput = String(form.get("console") || "").trim();
    const consoleName = normalizeConsole(consoleInput);

    const downloadUrl = String(
      form.get("downloadUrl") || ""
    ).trim();

    let description = String(
      form.get("description") || ""
    ).trim();

    const rom = form.get("rom") || form.get("zip");
    const cover = form.get("cover");

    if (!name) {
      return json({ error: "Informe o nome do jogo." }, 400);
    }

    if (downloadUrl && !/^https?:\/\//i.test(downloadUrl)) {
      return json({ error: "Link de download inválido." }, 400);
    }

    if (
      !rom ||
      typeof rom.arrayBuffer !== "function" ||
      rom.size === 0
    ) {
      return json({
        error: "Selecione o arquivo da ROM."
      }, 400);
    }

    if (rom.size > MAX_FILE_SIZE) {
      return json({
        error: "A ROM ultrapassa 50 MB."
      }, 400);
    }

    if (description.length > 3000) {
      return json({
        error: "A descrição ultrapassa 3000 caracteres."
      }, 400);
    }

    const slug = slugify(name);

    if (!slug) {
      return json({
        error: "Nome de jogo inválido."
      }, 400);
    }

    const romFilename = safeRomName(rom.name);

    if (!romFilename || !isRom(romFilename)) {
      return json({
        error: "Envie uma ROM válida, sem ZIP. Formatos aceitos: SFC, SMC, NES, GBA, GBC, GB, MD, GEN, BIN e ISO."
      }, 400);
    }

    const core = getCore(consoleName);

    if (!core) {
      return json({
        error: "Console não suportado pelo gerador automático."
      }, 400);
    }

    const allowedExtensions = getExtensions(consoleName);
    const extension = "." + romFilename.split(".").pop().toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      return json({
        error: `O arquivo ${extension} não corresponde ao console ${consoleName}.`
      }, 400);
    }

    const romContent = new Uint8Array(
      await rom.arrayBuffer()
    );

    if (!romContent.length) {
      return json({
        error: "O arquivo da ROM está vazio."
      }, 400);
    }

    const token = env.GITHUB_TOKEN;
    const apiBase = `/repos/${OWNER}/${REPO}`;

    const reference = await github(
      `${apiBase}/git/ref/heads/${BRANCH}`,
      token
    );

    const parentSha = reference.object.sha;

    const parentCommit = await github(
      `${apiBase}/git/commits/${parentSha}`,
      token
    );

    const gamesUrl = `${SITE_URL}/games.json`;

    const gameDirectory =
      `pages/jogos-online/${consoleName}/${slug}`;

    const onlineUrl = `${SITE_URL}/${gameDirectory}/`;

    const pagePath =
      `pages/jogos/${consoleName}/${slug}.html`;

    const pageUrl = `${SITE_URL}/${pagePath}`;

    // Lê o catálogo e migra os endereços antigos.
    let games = [];

    try {
      const existing = await github(
        `${apiBase}/contents/games.json?ref=${BRANCH}`,
        token
      );

      games = JSON.parse(decodeBase64(existing.content));

      if (!Array.isArray(games)) games = [];

      games = games.map(migrateGame);

    } catch (error) {
      if (!String(error.message).includes("Not Found")) {
        throw error;
      }
    }

    const previousGame = games.find(game => {
      const sameSlug = slugify(game.slug || game.name) === slug;
      const sameConsole =
        normalizeConsole(game.console) === consoleName;

      return sameSlug && sameConsole;
    });

    // Mantém a capa anterior quando nenhuma nova é enviada.
    let coverPath = "";
    let coverUrl = "";
    let coverContent = null;

    if (
      cover &&
      typeof cover.arrayBuffer === "function" &&
      cover.size > 0
    ) {
      if (cover.size > 8 * 1024 * 1024) {
        return json({
          error: "A capa ultrapassa 8 MB."
        }, 400);
      }

      const imageExtensions = {
        ".jpg": ".jpg",
        ".jpeg": ".jpeg",
        ".png": ".png",
        ".webp": ".webp",
        ".gif": ".gif",
        ".avif": ".avif",
        ".bmp": ".bmp"
      };

      const originalExtension = (
        "." + String(cover.name || "").split(".").pop()
      ).toLowerCase();

      const coverExtension = imageExtensions[originalExtension];

      if (!coverExtension) {
        return json({
          error: "Formato de capa não suportado. Use JPG, JPEG, PNG, WEBP, GIF, AVIF ou BMP."
        }, 400);
      }

      if (
        cover.type &&
        !cover.type.startsWith("image/")
      ) {
        return json({
          error: "O arquivo selecionado não é uma imagem."
        }, 400);
      }

      coverPath = `${gameDirectory}/capa${coverExtension}`;
      coverUrl = `${SITE_URL}/${coverPath}`;

      coverContent = new Uint8Array(
        await cover.arrayBuffer()
      );

    } else if (previousGame && previousGame.coverUrl) {
      coverUrl = migrateUrl(previousGame.coverUrl);

    } else {
      coverPath = "img/capas/sem-capa.jpg";
      coverUrl = `${SITE_URL}/${coverPath}`;
    }

    // Gera a descrição.
    if (description) {
      description = limitDescription(description);
    } else {
      description = await generateDescription(name, consoleName);
    }

    // Chave privada da ROM no R2.
    const r2Key =
      `roms/${consoleName}/${slug}/${romFilename}`;

    // Envia o binário diretamente ao R2.
    await env.ROMS.put(r2Key, romContent, {
      httpMetadata: {
        contentType: "application/octet-stream",
        cacheControl: "private, no-store"
      },
      customMetadata: {
        game: name,
        console: consoleName
      }
    });

    // Página do emulador usa a API VIP.
    const indexHtml = createEmulatorIndex({
      name,
      consoleName,
      r2Key
    });

    const indexBytes = new TextEncoder().encode(indexHtml);

    const newGame = {
      name,
      console: consoleName,
      onlineUrl,
      pageUrl,
      downloadUrl: downloadUrl || "",
      coverUrl,
      description,
      slug,
      r2Key
    };

    games = games.filter(game => {
      const sameSlug = slugify(game.slug || game.name) === slug;
      const sameConsole =
        normalizeConsole(game.console) === consoleName;

      return !(sameSlug && sameConsole);
    });

    games.push(newGame);

    // Gera novamente todas as páginas de detalhes do catálogo.
    const pageFiles = new Map();

    for (const game of games) {
      const migratedGame = migrateGame(game);
      const path = getPagePath(migratedGame);

      const html = createGamePage({
        name: migratedGame.name,
        consoleName: normalizeConsole(migratedGame.console),
        onlineUrl: migratedGame.onlineUrl,
        coverUrl: migratedGame.coverUrl,
        downloadUrl: migratedGame.downloadUrl || "",
        description: migratedGame.description || "",
        r2Key: migratedGame.r2Key || ""
      });

      pageFiles.set(
        path,
        new TextEncoder().encode(html)
      );
    }

    const catalogBytes = new TextEncoder().encode(
      JSON.stringify(games, null, 2)
    );

    // ROM NÃO ENTRA NA LISTA DE ARQUIVOS DO GITHUB.
    const files = [
      {
        githubPath: `${gameDirectory}/index.html`,
        content: indexBytes
      },
      ...(coverContent ? [{
        githubPath: coverPath,
        content: coverContent
      }] : []),
      {
        githubPath: "games.json",
        content: catalogBytes
      },
      ...Array.from(pageFiles.entries()).map(([path, content]) => ({
        githubPath: path,
        content
      }))
    ];

    validateGitPaths(
      files.map(file => ({
        path: file.githubPath
      }))
    );

    const blobs = [];

    for (const file of files) {
      const blob = await github(
        `${apiBase}/git/blobs`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            content: base64(file.content),
            encoding: "base64"
          })
        }
      );

      blobs.push({
        path: file.githubPath,
        mode: "100644",
        type: "blob",
        sha: blob.sha
      });
    }

    const tree = await github(
      `${apiBase}/git/trees`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          base_tree: parentCommit.tree.sha,
          tree: blobs
        })
      }
    );

    const commit = await github(
      `${apiBase}/git/commits`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          message: `Publicar jogo e atualizar páginas: ${name}`,
          tree: tree.sha,
          parents: [parentSha]
        })
      }
    );

    await github(
      `${apiBase}/git/refs/heads/${BRANCH}`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify({
          sha: commit.sha
        })
      }
    );

    return json({
      ok: true,
      name,
      console: consoleName,
      onlineUrl,
      pageUrl,
      downloadUrl: downloadUrl || null,
      coverUrl,
      description,
      folder: `${gameDirectory}/`,
      indexGenerated: true,
      updatedGamePages: pageFiles.size,
      rom: romFilename,
      storage: "R2 privado",
      romKey: r2Key,
      catalogUrl: gamesUrl,
      message: "Jogo publicado! A ROM foi armazenada no R2 privado e as páginas foram atualizadas."
    });

  } catch (error) {
    console.error("ERRO AO PUBLICAR JOGO:", error);

    return json({
      error: error.message || "Falha ao publicar o jogo."
    }, 500);
  }
}
