import { readCustomerToken, json } from "../_lib/security.js";

const ALLOWED_ORIGIN = "https://dlretrogames.pages.dev";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function response(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders(),
      "Cache-Control": "private, no-store",
      ...extraHeaders
    }
  });
}

export async function onRequestOptions() {
  return response(null, 204);
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.ROMS || !env.DB || !env.SESSION_SECRET) {
      return response(
        JSON.stringify({ error: "Configuração do servidor incompleta." }),
        500,
        { "Content-Type": "application/json" }
      );
    }

    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

    if (!token) {
      return response(
        JSON.stringify({ error: "Faça login para acessar a ROM." }),
        401,
        { "Content-Type": "application/json" }
      );
    }

    const session = await readCustomerToken(token, env);

    if (!session || !session.u) {
      return response(
        JSON.stringify({ error: "Sessão inválida ou expirada." }),
        401,
        { "Content-Type": "application/json" }
      );
    }

    const user = await env.DB.prepare(`
      SELECT username, plan, blocked, expires_at
      FROM users
      WHERE username = ?
      LIMIT 1
    `).bind(session.u).first();

    if (!user || user.blocked) {
      return response(
        JSON.stringify({ error: "Conta não encontrada ou bloqueada." }),
        403,
        { "Content-Type": "application/json" }
      );
    }

    if (String(user.plan || "").toUpperCase().includes("VIP") === false) {
      return response(
        JSON.stringify({ error: "Este jogo é exclusivo para usuários VIP." }),
        403,
        { "Content-Type": "application/json" }
      );
    }

    if (
      user.expires_at &&
      new Date(user.expires_at).getTime() < Date.now()
    ) {
      return response(
        JSON.stringify({ error: "Seu plano VIP expirou." }),
        403,
        { "Content-Type": "application/json" }
      );
    }

    const url = new URL(request.url);
    const key = url.searchParams.get("key") || "";

    if (
      !key.startsWith("roms/") ||
      key.includes("..") ||
      key.includes("\\")
    ) {
      return response(
        JSON.stringify({ error: "Caminho da ROM inválido." }),
        400,
        { "Content-Type": "application/json" }
      );
    }

    const object = await env.ROMS.get(key);

    if (!object) {
      return response(
        JSON.stringify({ error: "ROM não encontrada." }),
        404,
        { "Content-Type": "application/json" }
      );
    }

    return response(object.body, 200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(object.size),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff"
    });

  } catch (error) {
    console.error("ERRO AO ENTREGAR ROM:", error);

    return response(
      JSON.stringify({ error: "Erro interno ao carregar a ROM." }),
      500,
      { "Content-Type": "application/json" }
    );
  }
}
