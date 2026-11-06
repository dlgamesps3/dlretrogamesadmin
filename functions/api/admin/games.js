import { requireAdmin, json } from "../../_lib/security.js";

const OWNER = "dlgamesps3";
const REPO = "dlretrogames";
const BRANCH = "main";

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

// LIMITA A DESCRIÇÃO A 150 CARACTERES.
function limitDescription(text) {
  text = String(text || "").replace(/\s+/g, " ").trim();

  if (text.length <= 150) return text;

  let shortened = text.slice(0, 147);
  shortened = shortened.replace(/\s+\S*$/, "");

  return shortened.trimEnd() + "...";
}

// GERA DESCRIÇÃO AUTOMÁTICA PELA WIKIPÉDIA.
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

function createEmulatorIndex({
  name,
  consoleName,
  romFilename
}) {
  const core = getCore(consoleName);

  const safeName = escapeHtml(name);
  const safeConsole = escapeHtml(consoleName);

  const romUrl = "./" +
    romFilename.split("/").map(encodeURIComponent).join("/");

  const safeRomUrl = JSON.stringify(romUrl);
  const safeGameName = JSON.stringify(name);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>${safeName} - DL RETRO GAMES</title>

<style>
* {
  box-sizing: border-box;
}

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

<div id="game"></div>

<div class="footer">
  DL RETRO GAMES - Jogos clássicos
</div>

<script>
window.EJS_player = "#game";
window.EJS_core = ${JSON.stringify(core)};
window.EJS_gameUrl = ${safeRomUrl};
window.EJS_gameName = ${safeGameName};
window.EJS_pathtodata =
  "https://cdn.emulatorjs.org/stable/data/";

window.EJS_startOnLoaded = true;
</script>

<script
  src="https://cdn.emulatorjs.org/stable/data/loader.js">
</script>

</body>
</html>`;
}

function createGamePage({
  name,
  consoleName,
  onlineUrl,
  coverUrl,
  downloadUrl,
  description
}) {
  const safeName = escapeHtml(name);
  const safeConsole = escapeHtml(consoleName);
  const safeCover = escapeHtml(coverUrl);
  const safeDownload = escapeHtml(downloadUrl);

  const finalDescription = limitDescription(
    description ||
    `Conheça ${name}, um clássico do console ${consoleName}. Prepare-se para reviver essa aventura retrô!`
  );

  const safeDescription = escapeHtml(finalDescription);

  const scriptOnlineUrl = JSON.stringify(onlineUrl)
    .replace(/</g, "\\u003c");

  const scriptName = JSON.stringify(name)
    .replace(/</g, "\\u003c");

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
  margin:10px auto 20px;display:block
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
  text-decoration:none;border:0;cursor:pointer;font-size:15px
}
.btn.download{background:#00e676}
#emulator{display:none;margin-top:25px}
#emulator iframe{
  width:100%;height:70vh;min-height:400px;
  border:2px solid #00d9ff;border-radius:10px;background:#000
}
</style>
</head>

<body>
<div class="container">
  <h1>${safeName}</h1>
  <div class="console">${safeConsole}</div>

  <img class="cover" src="${safeCover}" alt="${safeName}">

  <section class="description">
    <h2>Sobre o jogo</h2>
    <p>${safeDescription}</p>
  </section>

  <div class="buttons">
    <button class="btn" id="play-button" type="button">
      JOGAR ONLINE
    </button>

    ${downloadUrl ? `
    <a class="btn download" href="${safeDownload}" target="_blank" rel="noopener">
      BAIXAR JOGO
    </a>
    ` : ""}
  </div>

  <div id="emulator"></div>
</div>

<script>
document.getElementById("play-button").addEventListener("click", function() {
  const emulator = document.getElementById("emulator");

  if (!emulator.dataset.loaded) {
    const frame = document.createElement("iframe");
    frame.src = ${scriptOnlineUrl};
    frame.title = ${scriptName};
    frame.allowFullscreen = true;
    emulator.appendChild(frame);
    emulator.dataset.loaded = "true";
  }

  emulator.style.display = "block";
  emulator.scrollIntoView({ behavior: "smooth" });
});
</script>

</body>
</html>`;
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

    const gamesUrl =
      `https://${OWNER}.github.io/${REPO}/games.json`;

    const gameDirectory =
      `pages/jogos-online/${consoleName}/${slug}`;

    const onlineUrl =
      `https://${OWNER}.github.io/${REPO}/${gameDirectory}/`;

    const pagePath =
      `pages/jogos/${consoleName}/${slug}.html`;

    const pageUrl =
      `https://${OWNER}.github.io/${REPO}/${pagePath}`;

    // RECUPERA O CATÁLOGO EXISTENTE.
    let games = [];

    try {
      const existing = await github(
        `${apiBase}/contents/games.json?ref=${BRANCH}`,
        token
      );

      games = JSON.parse(decodeBase64(existing.content));

      if (!Array.isArray(games)) games = [];

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

    // CAPA DO JOGO.
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

      coverUrl =
        `https://${OWNER}.github.io/${REPO}/${coverPath}`;

      coverContent = new Uint8Array(
        await cover.arrayBuffer()
      );

    } else if (previousGame && previousGame.coverUrl) {
      coverUrl = previousGame.coverUrl;

    } else {
      coverPath = "img/capas/sem-capa.jpg";

      coverUrl =
        `https://${OWNER}.github.io/${REPO}/${coverPath}`;
    }

    // GERA A DESCRIÇÃO AUTOMÁTICA QUANDO NÃO FOI DIGITADA.
    if (description) {
      description = limitDescription(description);
    } else {
      description = await generateDescription(name, consoleName);
    }

    // GERA AUTOMATICAMENTE O INDEX.HTML DO EMULADOR.
    const indexHtml = createEmulatorIndex({
      name,
      consoleName,
      romFilename
    });

    const indexBytes = new TextEncoder().encode(indexHtml);

    // GERA A PÁGINA DE APRESENTAÇÃO.
    const pageHtml = createGamePage({
      name,
      consoleName,
      onlineUrl,
      coverUrl,
      downloadUrl,
      description
    });

    const pageBytes = new TextEncoder().encode(pageHtml);

    const newGame = {
      name,
      console: consoleName,
      onlineUrl,
      pageUrl,
      downloadUrl: downloadUrl || "",
      coverUrl,
      description,
      slug
    };

    // ATUALIZA SEM DUPLICAR O JOGO.
    games = games.filter(game => {
      const sameSlug = slugify(game.slug || game.name) === slug;

      const sameConsole =
        normalizeConsole(game.console) === consoleName;

      return !(sameSlug && sameConsole);
    });

    games.push(newGame);

    const catalogBytes = new TextEncoder().encode(
      JSON.stringify(games, null, 2)
    );

    // ARQUIVOS QUE SERÃO PUBLICADOS.
    const files = [
      {
        githubPath: `${gameDirectory}/index.html`,
        content: indexBytes
      },
      {
        githubPath: `${gameDirectory}/${romFilename}`,
        content: romContent
      },
      ...(coverContent ? [{
        githubPath: coverPath,
        content: coverContent
      }] : []),
      {
        githubPath: pagePath,
        content: pageBytes
      },
      {
        githubPath: "games.json",
        content: catalogBytes
      }
    ];

    validateGitPaths(
      files.map(file => ({
        path: file.githubPath
      }))
    );

    // CRIA OS ARQUIVOS NO GITHUB.
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
          message: `Publicar jogo: ${name}`,
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
      rom: romFilename,
      catalogUrl: gamesUrl,
      message: "Jogo publicado! ROM e index.html criados automaticamente."
    });

  } catch (error) {
    console.error("ERRO AO PUBLICAR JOGO:", error);

    return json({
      error: error.message || "Falha ao publicar o jogo."
    }, 500);
  }
}
