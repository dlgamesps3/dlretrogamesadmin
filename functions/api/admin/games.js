
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
  return name.toLowerCase().endsWith(".zip");
}

function isRom(name) {
  const lower = name.toLowerCase();

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

async function extractZip(buffer, prefix = "", depth = 0, budget = { total: 0 }) {
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

  if (end < 0) throw new Error("ZIP inválido ou não suportado.");

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
      originalName.includes("__MACOSX/") ||
      originalName.startsWith("__MACOSX/")
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

    // Se encontrar outro ZIP, extrai automaticamente.
    if (isZip(filename)) {
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
    const consoleName = String(form.get("console") || "").trim();
    const downloadUrl = String(form.get("downloadUrl") || "").trim();
    const zip = form.get("zip");
    const cover = form.get("cover");

    if (!name) {
      return json({ error: "Informe o nome do jogo." }, 400);
    }

    if (downloadUrl && !/^https?:\/\//i.test(downloadUrl)) {
      return json({ error: "Link de download inválido." }, 400);
    }

    if (!zip || typeof zip.arrayBuffer !== "function" || zip.size === 0) {
      return json({ error: "Envie o ZIP do jogo." }, 400);
    }

    if (zip.size > MAX_FILE_SIZE) {
      return json({ error: "O ZIP ultrapassa 50 MB." }, 400);
    }

    const slug = slugify(name);

    if (!slug) {
      return json({ error: "Nome de jogo inválido." }, 400);
    }

    // Extrai o ZIP principal e também os ZIPs encontrados dentro dele.
    const extractedFiles = await extractZip(
      await zip.arrayBuffer()
    );

    // Procura um index.html que tenha ROM dentro da mesma pasta
    // ou em alguma subpasta.
    const indexCandidates = extractedFiles.filter(file =>
      file.name.toLowerCase() === "index.html"
    );

    let selectedIndex = null;
    let selectedRoms = [];

    for (const candidate of indexCandidates) {
      const folder = dirname(candidate.path);

      const matchingRoms = extractedFiles.filter(file => {
        const relative = relativeTo(file.path, folder);

        return relative !== null && isRom(file.name);
      });

      if (matchingRoms.length > 0) {
        selectedIndex = candidate;
        selectedRoms = matchingRoms;
        break;
      }
    }

    if (!selectedIndex || selectedRoms.length === 0) {
      return json({
        error: "O ZIP precisa conter index.html e pelo menos uma ROM compatível. O sistema também procura dentro de ZIPs internos."
      }, 400);
    }

    const gameFolder = dirname(selectedIndex.path);

    // Mantém os caminhos relativos ao index.html.
    const files = [
      {
        name: "index.html",
        path: "index.html",
        content: selectedIndex.content
      }
    ];

    for (const rom of selectedRoms) {
      const relative = relativeTo(rom.path, gameFolder);

      if (!relative) continue;

      files.push({
        name: relative.split("/").pop(),
        path: relative,
        content: rom.content
      });
    }

    // Não permite arquivos extras no diretório do jogo.
    const selectedPaths = new Set(
      files.map(file => file.path.toLowerCase())
    );

    const unsupported = extractedFiles.filter(file => {
      const relative = relativeTo(file.path, gameFolder);

      if (relative === null) return false;

      return !selectedPaths.has(relative.toLowerCase());
    });

    if (unsupported.length > 0) {
      return json({
        error: "O jogo contém arquivos extras. O ZIP deve conter somente index.html e arquivos ROM compatíveis."
      }, 400);
    }

    if (
      new Set(files.map(file => file.path.toLowerCase())).size !== files.length
    ) {
      return json({
        error: "Existem arquivos com nomes ou caminhos repetidos."
      }, 400);
    }

    let coverPath = "img/capas/sem-capa.jpg";

    if (cover && typeof cover.arrayBuffer === "function" && cover.size > 0) {
      if (cover.size > 8 * 1024 * 1024) {
        return json({ error: "A capa ultrapassa 8 MB." }, 400);
      }

      const ext = cover.type === "image/png" ? ".png"
        : cover.type === "image/webp" ? ".webp"
        : cover.type === "image/jpeg" ? ".jpg"
        : null;

      if (!ext) {
        return json({
          error: "A capa precisa ser JPG, PNG ou WEBP."
        }, 400);
      }

      coverPath = `pages/jogos-online/${slug}/capa${ext}`;

      files.push({
        name: `capa${ext}`,
        path: `capa${ext}`,
        content: new Uint8Array(await cover.arrayBuffer())
      });
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

    const onlineUrl =
      `https://${OWNER}.github.io/${REPO}/pages/jogos-online/${slug}/`;

    const coverUrl =
      `https://${OWNER}.github.io/${REPO}/${coverPath}`;

    // Recupera o catálogo existente.
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

    const newGame = {
      name,
      console: consoleName || "SNES",
      onlineUrl,
      downloadUrl: downloadUrl || "",
      coverUrl,
      slug
    };

    games = games.filter(game => game.slug !== slug);
    games.push(newGame);

    const catalogBytes = new TextEncoder().encode(
      JSON.stringify(games, null, 2)
    );

    files.push({
      name: "games.json",
      path: "games.json",
      content: catalogBytes,
      catalog: true
    });

    // Cria os arquivos no GitHub.
    const blobs = [];

    for (const file of files) {
      const blob = await github(`${apiBase}/git/blobs`, token, {
        method: "POST",
        body: JSON.stringify({
          content: base64(file.content),
          encoding: "base64"
        })
      });

      blobs.push({
        path: file.catalog
          ? "games.json"
          : `pages/jogos-online/${slug}/${file.path}`,
        mode: "100644",
        type: "blob",
        sha: blob.sha
      });
    }

    const tree = await github(`${apiBase}/git/trees`, token, {
      method: "POST",
      body: JSON.stringify({
        base_tree: parentCommit.tree.sha,
        tree: blobs
      })
    });

    const commit = await github(`${apiBase}/git/commits`, token, {
      method: "POST",
      body: JSON.stringify({
        message: `Adicionar jogo ao catálogo: ${name}`,
        tree: tree.sha,
        parents: [parentSha]
      })
    });

    await github(`${apiBase}/git/refs/heads/${BRANCH}`, token, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha })
    });

    return json({
      ok: true,
      name,
      console: consoleName || "SNES",
      onlineUrl,
      downloadUrl: downloadUrl || null,
      coverUrl,
      folder: `pages/jogos-online/${slug}/`,
      catalogUrl: gamesUrl,
      message: "Jogo publicado e adicionado ao catálogo!"
    });

  } catch (error) {
    return json({
      error: error.message || "Falha ao publicar o jogo."
    }, 500);
  }
}
