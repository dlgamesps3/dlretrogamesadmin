
import { readCustomerToken, json } from "../_lib/security.js";

const ALLOWED_ORIGIN = "https://dlretrogames.pages.dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin"
};

const CONSOLES = [
  "SNES", "NES", "GBA", "GBC", "GB",
  "Mega-Drive", "PS1"
];

export async function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin");

  if (origin !== ALLOWED_ORIGIN) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const origin = request.headers.get("Origin");

    if (origin && origin !== ALLOWED_ORIGIN) {
      return json({ error: "Origem não autorizada." }, 403);
    }

    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    const session = await readCustomerToken(token, env);

    if (!session) {
      return json(
        { error: "Faça login novamente para pedir um jogo." },
        401,
        CORS_HEADERS
      );
    }

    const user = await env.DB.prepare(
      `SELECT username, blocked, expires_at
       FROM users WHERE username = ?`
    ).bind(session.u).first();

    if (
      !user ||
      user.blocked ||
      (user.expires_at &&
        new Date(user.expires_at).getTime() < Date.now())
    ) {
      return json(
        { error: "Sua conta não está ativa." },
        403,
        CORS_HEADERS
      );
    }

    const body = await request.json();

    const gameName = String(body.game_name || "").trim();
    const consoleName = String(body.console || "").trim();

    if (gameName.length < 2 || gameName.length > 100) {
      return json(
        { error: "O nome do jogo deve ter entre 2 e 100 caracteres." },
        400,
        CORS_HEADERS
      );
    }

    if (!CONSOLES.includes(consoleName)) {
      return json(
        { error: "Console inválido." },
        400,
        CORS_HEADERS
      );
    }

    await env.DB.prepare(
      `INSERT INTO game_requests
       (username, game_name, console)
       VALUES (?, ?, ?)`
    ).bind(
      user.username,
      gameName,
      consoleName
    ).run();

    return json({
      ok: true,
      message: "Pedido enviado com sucesso!"
    }, 201, CORS_HEADERS);

  } catch (error) {
    console.error(error);

    return json(
      { error: "Não foi possível enviar o pedido." },
      500,
      CORS_HEADERS
    );
  }
}
