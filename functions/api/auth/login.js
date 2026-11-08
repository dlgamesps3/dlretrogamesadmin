
import {
  verifyPassword,
  createCustomerToken,
  json
} from "../../_lib/security.js";

const ALLOWED_ORIGIN = "https://dlretrogames.pages.dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
};

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

    const { username, password } = await request.json();

    const user = await env.DB.prepare(
      `SELECT username,password_hash,plan,expires_at,blocked
       FROM users WHERE username=?`
    ).bind(String(username || "")).first();

    if (
      !user ||
      user.blocked ||
      !(await verifyPassword(
        String(password || ""),
        user.password_hash
      ))
    ) {
      return json(
        { error: "Usuário ou senha inválidos." },
        401,
        CORS_HEADERS
      );
    }

    if (
      user.expires_at &&
      new Date(user.expires_at).getTime() < Date.now()
    ) {
      return json(
        { error: "Seu acesso expirou." },
        403,
        CORS_HEADERS
      );
    }

    const token = await createCustomerToken(
      env,
      user.username
    );

    return json({
      ok: true,
      plan: user.plan,
      expires_at: user.expires_at,
      token
    }, 200, CORS_HEADERS);

  } catch (error) {
    console.error(error);

    return json(
      { error: "Não foi possível validar o acesso." },
      400,
      CORS_HEADERS
    );
  }
}
