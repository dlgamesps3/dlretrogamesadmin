import { requireAdmin, json } from "../../_lib/security.js";

const enc = new TextEncoder();

function b64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
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

export async function onRequestGet({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);

    if (!admin) {
      return json({ error: "Acesso não autorizado." }, 401);
    }

    if (
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_REDIRECT_URI ||
      !env.SESSION_SECRET
    ) {
      return json({ error: "Configuração do Google incompleta." }, 500);
    }

    const payload = b64url(
      enc.encode(JSON.stringify({
        user: admin.u,
        exp: Date.now() + 10 * 60 * 1000
      }))
    );

    const signature = await sign(payload, env.SESSION_SECRET);
    const state = `${payload}.${signature}`;

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive",
      access_type: "offline",
      prompt: "consent",
      state
    });

    return Response.redirect(
      "https://accounts.google.com/o/oauth2/v2/auth?" + params,
      302
    );

  } catch (error) {
    return json({ error: error.message || "Erro ao iniciar autorização." }, 500);
  }
}
