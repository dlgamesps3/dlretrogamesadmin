
import {
  requireAdmin,
  json,
  hashPassword,
  randomCredential
} from "../../_lib/security.js";

export async function onRequestGet({ request, env }) {
  try {
    if (!(await requireAdmin(request, env))) {
      return json({ error: "Não autenticado." }, 401);
    }

    const { results = [] } = await env.DB.prepare(
      "SELECT id, username, plan, note, expires_at, blocked, created_at FROM users ORDER BY created_at DESC"
    ).all();

    return json({ users: results });

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!(await requireAdmin(request, env))) {
      return json({ error: "Não autenticado." }, 401);
    }

    const body = await request.json();

    const name = String(body.name || "").trim();
    const mode = body.mode === "manual" ? "manual" : "automatic";

    const plan = body.plan === "VIP" ? "VIP" : "GRATIS";
    const days = Math.max(0, Math.min(3650, Number(body.days) || 0));

    if (!name) {
      return json({ error: "Informe o nome da pessoa." }, 400);
    }

    if (name.length > 60) {
      return json({ error: "O nome deve ter até 60 caracteres." }, 400);
    }

    let username;
    let password;

    if (mode === "manual") {
      username = String(body.username || "").trim();
      password = String(body.password || "");

      if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
        return json({
          error: "O usuário deve ter de 3 a 30 caracteres, usando letras, números, ponto, hífen ou underline."
        }, 400);
      }

      if (password.length < 6 || password.length > 100) {
        return json({
          error: "A senha deve ter entre 6 e 100 caracteres."
        }, 400);
      }

    } else {
      username = `dlrg_${randomCredential(7).toLowerCase()}`;
      password = randomCredential(12);
    }

    const password_hash = await hashPassword(password);

    const expires_at = days
      ? new Date(Date.now() + days * 86400000).toISOString()
      : null;

    const note = `Nome: ${name}`.slice(0, 100);

    await env.DB.prepare(
      "INSERT INTO users (username,password_hash,plan,note,expires_at,blocked,created_at) VALUES (?,?,?,?,?,0,?)"
    )
      .bind(
        username,
        password_hash,
        plan,
        note,
        expires_at,
        new Date().toISOString()
      )
      .run();

    return json({
      ok: true,
      name,
      username,
      password,
      plan,
      expires_at,
      message: "Usuário criado com sucesso!"
    });

  } catch (e) {
    const message = String(e.message || "");

    if (message.toLowerCase().includes("unique")) {
      return json({
        error: "Esse nome de usuário já existe. Escolha outro."
      }, 409);
    }

    return json({
      error: e.message || "Falha ao criar usuário."
    }, 500);
  }
}
