
import { requireAdmin, json } from "../../_lib/security.js";

const OWNER = "dlgamesps3";
const REPO = "dlretrogames";
const BRANCH = "main";

const ROM_EXTENSIONS = [
  ".sfc", ".smc", ".nes", ".gba", ".gbc",
  ".gb", ".md", ".gen", ".bin", ".iso"
];

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_TOTAL_SIZE = 150 * 1024 * 1024;
const MAX_ZIP_DEPTH = 3;

function slugify(value) {
  return String(value || "jogo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 70);
}

function normalizeConsole(value) {
  const text = String(value || "").toLowerCase();

  if (text.includes("snes") || text.includes("super nintendo")) {
    return "SNES";
  }

  if (text.includes("gba") || text.includes("game boy advance")) {
    return "GBA";
  }

  if (text.includes("nes") || text.includes("nintendo")) {
    return "NES";
  }

  if (
    text.includes("mega") ||
    text.includes("genesis") ||
    text.includes("megadrive")
  ) {
    return "Mega-Drive";
  }

  if (text.includes("ps1") || text.includes("playstation")) {
    return "PS1";
  }

  return slugify(value) || "SNES";
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

function safePath(path) {
  const normalized = String(path || "").replace(/\\/g, "/");

  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split("/").some(part => part === "..")
  ) {
    return null;
  }

  const parts = normalized
    .split("/")
    .filter(part => part && part !== ".");

  if (!parts.length) return null;

  return parts.join("/");
}

function isZip(name) {
  return String(name || "").toLowerCase().endsWith(".zip");
}

function isRom(name) {
  const lower = String(name || "").toLowerCase();

  return ROM_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function dirname(path) {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function relativeTo(path, prefix) {
  if (!prefix) return path;
  if (path === prefix) return "";
  if (!path.startsWith(prefix + "/")) return null;

  return path.slice(prefix.length + 1);
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

// EXTRAI OS ZIPs E PRESERVA OS ARQUIVOS ZIP ORIGINAIS.
async function extractZip(
  buffer,
  prefix = "",
  depth = 0,
  budget = { total: 0 }
) {
  if (depth > MAX_ZIP_DEPTH) {
    throw new Error("Existem ZIPs internos demais. Limite de 3 níveis.");
  }

  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  let end = -1;

  for (
    let i = bytes.length - 22;
    i >= Math.max(0, bytes.length - 65557);
    i--
  ) {
    if (
      i + 4 <= bytes.length &&
      view.getUint32(i, true) === 0x06054b50
    ) {
      end = i;
      break;
    }
  }

  if (end < 0) {
    throw new Error("ZIP inválido ou não suportado.");
  }

  const count = view.getUint16(end + 10, true);
  const directoryOffset = view.getUint32(end + 16, true);

  let position = directoryOffset;
  const files = [];

  for (let i = 0; i < count; i++) {
    if (
      position + 46 > bytes.length ||
      view.getUint32(position, true) !== 0x02014b50
    ) {
      throw new Error("Estrutura ZIP inválida.");
    }

    const method = view.getUint16(position + 10, true);
    const compressedSize = view.getUint32(position + 20, true);
    const uncompressedSize = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const localOffset = view.getUint32(position + 42, true);

    const nameStart = position + 46;
    const nameEnd = nameStart + nameLength;

    if (nameEnd > bytes.length) {
      throw new Error("Nome de arquivo ZIP inválido.");
    }

    const originalName = new TextDecoder().decode(
      bytes.subarray(nameStart, nameEnd)
    );

    position += 46 + nameLength + extraLength + commentLength;

    if (
      originalName.endsWith("/") ||
      originalName.includes("__MACOSX/")
    ) {
      continue;
    }

    const cleanName = safePath(originalName);

    if (!cleanName) continue;

    const filename = cleanName.split("/").pop();

    if (!filename || filename.startsWith(".")) continue;

    if (uncompressedSize > MAX_FILE_SIZE) {
      throw new Error(`O arquivo ${filename} ultrapassa 50 MB.`);
    }

    if (
      localOffset + 30 > bytes.length ||
      view.getUint32(localOffset, true) !== 0x04034b50
    ) {
      throw new Error("Arquivo ZIP inválido.");
    }

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);

    const dataStart =
      localOffset + 30 + localNameLength + localExtraLength;

    const dataEnd = dataStart + compressedSize;

    if (dataEnd > bytes.length) {
      throw new Error("Dados incompletos no ZIP.");
    }

    const compressed = bytes.slice(dataStart, dataEnd);

    let content;

    if (method === 0) {
      content = compressed;
    } else if (method === 8) {
      const stream = new Blob([compressed])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));

      content = new Uint8Array(
        await new Response(stream).arrayBuffer()
      );
    } else {
      throw new Error("Compressão ZIP não suportada.");
    }

    if (content.length > MAX_FILE_SIZE) {
      throw new Error(`O arquivo ${filename} ultrapassa 50 MB.`);
    }

    budget.total += content.length;

    if (budget.total > MAX_TOTAL_SIZE) {
      throw new Error("O conteúdo extraído ultrapassa 150 MB.");
    }

    const fullPath = prefix
      ? `${prefix}/${cleanName}`
      : cleanName;

    if (isZip(filename)) {
      // GUARDA O ZIP ORIGINAL.
      files.push({
        path: fullPath,
        name: filename,
        content
      });

      // EXTRAI TAMBÉM O CONTEÚDO DO ZIP.
      const nestedFiles = await extractZip(
        content.buffer.slice(
          content.byteOffset,
          content.byteOffset + content.byteLength
        ),
        dirname(fullPath),
        depth + 1,
        budget
      );

      files.push(...nestedFiles);

    } else {
      files.push({
        path: fullPath,
        name: filename,
        content
      });
    }
  }

  return files;
}

async function github(path, token, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "DL-RETRO-GAMES",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Erro ao acessar o GitHub.");
  }

  return data;
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
  const safeOnline = escapeHtml(onlineUrl);
  const safeCover = escapeHtml(coverUrl);
  const safeDownload = escapeHtml(downloadUrl);

  const finalDescription = description ||
    `Conheça ${name}, um clássico do console ${consoleName}. Prepare-se para reviver essa aventura retrô!`;

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
*{
  box-sizing:border-box;
}

body{
  margin:0;
  padding:20px;
  background:#080b16;
  color:#fff;
  font-family:Arial,sans-serif;
  text-align:center;
}

.container{
  max-width:850px;
  margin:auto;
}

h1{
  color:#00eaff;
  font-size:30px;
}

.console{
  color:#aaa;
  margin-bottom:20px;
}

.cover{
  width:220px;
  max-width:85%;
  border-radius:12px;
  margin:10px auto 20px;
  display:block;
}

.description{
  background:#111a2d;
  border:1px solid #193c55;
  border-radius:12px;
  padding:20px;
  margin:20px auto;
  text-align:left;
  line-height:1.7;
  color:#ddd;
}

.description h2{
  color:#00eaff;
  margin-top:0;
}

.buttons{
  display:flex;
  gap:12px;
  justify-content:center;
  flex-wrap:wrap;
  margin:25px 0;
}

.btn{
  display:inline-block;
  padding:15px 24px;
  border-radius:8px;
  background:#00d9ff;
  color:#001018;
  font-weight:bold;
  text-decoration:none;
  border:0;
  cursor:pointer;
  font-size:15px;
}

.btn.download{
  background:#00e676;
}

#emulator{
  display:none;
  margin-top:25px;
}

#emulator iframe{
  width:100%;
  height:70vh;
  min-height:400px;
  border:2px solid #00d9ff;
  border-radius:10px;
  background:#000;
}
</style>
</head>

<body>
<div class="container">

  <h1>${safeName}</h1>

  <div class="console">${safeConsole}</div>

  <img
    class="cover"
    src="${safeCover}"
    alt="${safeName}"
  >

  <section class="description">
    <h2>Sobre o jogo</h2>
    <p>${safeDescription}</p>
  </section>

  <div class="buttons">

    <button
      class="btn"
      id="play-button"
      type="button"
    >
      JOGAR ONLINE
    </button>

    ${downloadUrl ? `
    <a
      class="btn download"
      href="${safeDownload}"
      target="_blank"
      rel="noopener"
    >
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

  emulator.scrollIntoView({
    behavior: "smooth"
  });

});
</script>

</body>
</html>`;
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

    const consoleInput = String(
      form.get("console") || ""
    ).trim();

    const consoleName = normalizeConsole(consoleInput);

    const downloadUrl = String(
      form.get("downloadUrl") || ""
    ).trim();

    const description = String(
      form.get("description") || ""
    ).trim();

    const zip = form.get("zip");
    const cover = form.get("cover");

    if (!name) {
      return json({
        error: "Informe o nome do jogo."
      }, 400);
    }

    if (downloadUrl && !/^https?:\/\//i.test(downloadUrl)) {
      return json({
        error: "Link de download inválido."
      }, 400);
    }

    if (
      !zip ||
      typeof zip.arrayBuffer !== "function" ||
      zip.size === 0
    ) {
      return json({
        error: "Envie o ZIP do jogo."
      }, 400);
    }

    if (zip.size > MAX_FILE_SIZE) {
      return json({
        error: "O ZIP ultrapassa 50 MB."
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

    // EXTRAI O ZIP PRINCIPAL E OS ZIPs INTERNOS.
    const extractedFiles = await extractZip(
      await zip.arrayBuffer()
    );

    // PROCURA O INDEX.HTML E UMA ROM NA MESMA PASTA
    // OU EM ALGUMA SUBPASTA.
    const indexCandidates = extractedFiles.filter(file =>
      file.name.toLowerCase() === "index.html"
    );

    let selectedIndex = null;

    for (const candidate of indexCandidates) {
      const folder = dirname(candidate.path);

      const matchingRoms = extractedFiles.filter(file => {
        const relative = relativeTo(file.path, folder);

        return relative !== null && isRom(file.name);
      });

      if (matchingRoms.length > 0) {
        selectedIndex = candidate;
        break;
      }
    }

    if (!selectedIndex) {
      return json({
        error: "O ZIP precisa conter index.html e pelo menos uma ROM compatível. O sistema também procura dentro de ZIPs internos."
      }, 400);
    }

    const gameFolder = dirname(selectedIndex.path);

    // PRESERVA OS ARQUIVOS DA PASTA DO JOGO,
    // INCLUINDO OS ZIPs ORIGINAIS.
    const gameFiles = extractedFiles
      .map(file => {
        const relative = relativeTo(file.path, gameFolder);

        if (relative === null || !relative) return null;

        return {
          name: relative.split("/").pop(),
          path: relative,
          content: file.content
        };
      })
      .filter(Boolean);

    const hasIndex = gameFiles.some(file =>
      file.path.toLowerCase() === "index.html"
    );

    const hasRom = gameFiles.some(file =>
      isRom(file.name)
    );

    if (!hasIndex || !hasRom) {
      return json({
        error: "Não foi possível localizar o index.html e a ROM do jogo."
      }, 400);
    }

    const uniquePaths = new Set(
      gameFiles.map(file => file.path.toLowerCase())
    );

    if (uniquePaths.size !== gameFiles.length) {
      return json({
        error: "Existem arquivos com nomes ou caminhos repetidos."
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

      games = JSON.parse(
        decodeBase64(existing.content)
      );

      if (!Array.isArray(games)) {
        games = [];
      }

    } catch (error) {
      if (!String(error.message).includes("Not Found")) {
        throw error;
      }
    }

    // LOCALIZA O JOGO ANTERIOR PARA PRESERVAR A CAPA.
    const previousGame = games.find(game => {
      const sameSlug = slugify(game.slug || game.name) === slug;
      const sameConsole =
        normalizeConsole(game.console) === consoleName;

      return sameSlug && sameConsole;
    });

    let coverPath = "";
    let coverUrl = "";

    let coverExtension = null;
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

      coverExtension =
        cover.type === "image/png" ? ".png" :
        cover.type === "image/webp" ? ".webp" :
        cover.type === "image/jpeg" ? ".jpg" :
        null;

      if (!coverExtension) {
        return json({
          error: "A capa precisa ser JPG, PNG ou WEBP."
        }, 400);
      }

      coverPath =
        `${gameDirectory}/capa${coverExtension}`;

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

    // ATUALIZA O JOGO SEM DUPLICAR.
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

    const pageBytes = new TextEncoder().encode(
      createGamePage({
        name,
        consoleName,
        onlineUrl,
        coverUrl,
        downloadUrl,
        description
      })
    );

    const files = [
      ...gameFiles.map(file => ({
        githubPath: `${gameDirectory}/${file.path}`,
        content: file.content
      })),

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
      catalogUrl: gamesUrl,
      message: "Jogo publicado e adicionado ao catálogo!"
    });

  } catch (error) {
    return json({
      error: error.message || "Falha ao publicar o jogo."
    }, 500);
  }
}
