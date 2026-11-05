
const enc = new TextEncoder();

function b64url(bytes) {
  let binary = "";
  for (const b of new Uint8Array(bytes)) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return b64url(
    await crypto.subtle.sign("HMAC", key, enc.encode(value))
  );
}

function page(message, status = 200) {
  return new Response(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DL RETRO GAMES - Google Drive</title>
</head>
<body style="font-family:Arial;padding:25px;background:#111;color:white">
<h2>DL RETRO GAMES</h2>
${message}
</body>
</html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'"
    }
  });
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const googleError = url.searchParams.get("error");

    if (googleError) {
      return page("<p>Autorização cancelada pelo Google.</p>", 400);
    }

    if (!code || !state || !env.SESSION_SECRET) {
      return page("<p>Dados de autorização incompletos.</p>", 400);
    }

    const parts = state.split(".");
    if (parts.length !== 2) {
      return page("<p>Autorização inválida.</p>", 400);
    }

    const [payload, signature] = parts;
    const expected = await sign(payload, env.SESSION_SECRET);

    if (signature !== expected) {
      return page("<p>Assinatura inválida.</p>", 403);
    }

    let data;

    try {
      let encoded = payload.replace(/-/g, "+").replace(/_/g, "/");
      while (encoded.length % 4) encoded += "=";

      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return page("<p>Estado de autorização inválido.</p>", 400);
    }

    if (!data.user || !data.exp || data.exp < Date.now()) {
      return page("<p>Autorização expirada. Inicie novamente pelo painel.</p>", 403);
    }

    if (
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_CLIENT_SECRET ||
      !env.GOOGLE_REDIRECT_URI
    ) {
      return page("<p>Configuração do Google incompleta no Cloudflare.</p>", 500);
    }

    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: env.GOOGLE_REDIRECT_URI,
          grant_type: "authorization_code"
        })
      }
    );

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return page(
        "<p>O Google não aceitou a autorização. Verifique as credenciais e tente novamente.</p>",
        400
      );
    }

    if (!tokens.refresh_token) {
      return page(
        "<p>O Google não forneceu um novo refresh token. Revise a autorização e tente novamente.</p>",
        400
      );
    }

    const refreshToken = String(tokens.refresh_token)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    return page(`
      <h3>Google autorizado!</h3>
      <p>Copie o código abaixo e cadastre no Cloudflare como Secret.</p>
      <textarea id="token" readonly
        style="width:100%;height:110px;box-sizing:border-box">${refreshToken}</textarea>
      <p><button onclick="document.getElementById('token').select();document.execCommand('copy')">
        COPIAR TOKEN
      </button></p>
      <p>Nome do Secret: <strong>GOOGLE_REFRESH_TOKEN</strong></p>
      <p>Não compartilhe esse token. Depois de salvá-lo no Cloudflare, feche esta página.</p>
    `);

  } catch {
    return page("<p>Erro interno durante a autorização do Google.</p>", 500);
  }
}

