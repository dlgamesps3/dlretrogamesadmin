
import { requireAdmin, json } from "../../_lib/security.js";

export async function onRequestGet({ request, env }) {
  try {
    const session = await requireAdmin(request, env);

    if (!session) {
      return json({ error: "Não autenticado." }, 401);
    }

    const result = await env.DB.prepare(`
      SELECT
        r.id,
        r.username,
        r.game_name,
        r.console,
        r.status,
        r.created_at,
        u.note
      FROM game_requests r
      LEFT JOIN users u ON u.username = r.username
      ORDER BY r.id DESC
    `).all();

    return json({
      ok: true,
      requests: result.results || []
    });

  } catch (error) {
    console.error("Erro ao carregar pedidos:", error);

    return json({
      error: "Não foi possível carregar os pedidos."
    }, 500);
  }
}
