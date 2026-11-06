
const enc = new TextEncoder();
const COOKIE = "dlrg_admin";
const ITERATIONS = 100000;

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

function fromB64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(value))
  );
}

export async function hashPassword(
  password,
  salt = crypto.getRandomValues(new Uint8Array(16))
) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256"
    },
    key,
    256
  );

  return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(bits)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iterations, salt, expected] =
    String(stored || "").split("$");

  if (
    scheme !== "pbkdf2" ||
    Number(iterations) !== ITERATIONS ||
    !salt ||
    !expected
  ) {
    return false;
  }

  const actual = await hashPassword(password, fromB64url(salt));
  const a = fromB64url(actual.split("$")[3]);
  const b = fromB64url(expected);

  if (a.length !== b.length) return false;

  let diff = 0;

  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

/* SESSÃO DO ADMINISTRADOR */

export async function createSession(env, username) {
  const payload = b64url(
    enc.encode(JSON.stringify({
      u: username,
      exp: Date.now() + 8 * 60 * 60 * 1000
    }))
  );

  const sig = b64url(await hmac(payload, env.SESSION_SECRET));

  return `${payload}.${sig}`;
}

export async function readSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`)
  );

  if (!match) return null;

  const [payload, sig] = match[1].split(".");
  if (!payload || !sig) return null;

  try {
    const expected = await hmac(payload, env.SESSION_SECRET);
    const got = fromB64url(sig);

    if (got.length !== expected.length) return null;

    let diff = 0;

    for (let i = 0; i < got.length; i++) {
      diff |= got[i] ^ expected[i];
    }

    if (diff) return null;

    const data = JSON.parse(
      new TextDecoder().decode(fromB64url(payload))
    );

    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

/* TOKEN SEPARADO DOS CLIENTES */

export async function createCustomerToken(env, username) {
  if (!env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET não configurado.");
  }

  const payload = b64url(
    enc.encode(JSON.stringify({
      u: username,
      typ: "customer",
      exp: Date.now() + 8 * 60 * 60 * 1000
    }))
  );

  const sig = b64url(
    await hmac(payload, env.SESSION_SECRET)
  );

  return `${payload}.${sig}`;
}

export async function readCustomerToken(token, env) {
  if (!token || !env.SESSION_SECRET) return null;

  try {
    const [payload, sig] = String(token).split(".");

    if (!payload || !sig) return null;

    const expected = await hmac(payload, env.SESSION_SECRET);
    const got = fromB64url(sig);

    if (got.length !== expected.length) return null;

    let diff = 0;

    for (let i = 0; i < got.length; i++) {
      diff |= got[i] ^ expected[i];
    }

    if (diff !== 0) return null;

    const data = JSON.parse(
      new TextDecoder().decode(fromB64url(payload))
    );

    if (
      data.typ !== "customer" ||
      !data.u ||
      typeof data.exp !== "number" ||
      data.exp <= Date.now()
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/* COOKIES DO ADMINISTRADOR */

export function sessionCookie(value) {
  return `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`;
}

export function clearCookie() {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export async function requireAdmin(request, env) {
  if (
    !env.DB ||
    !env.SESSION_SECRET ||
    !env.ADMIN_USERNAME ||
    !env.ADMIN_PASSWORD_HASH
  ) {
    throw new Error("Configuração do servidor incompleta.");
  }

  return await readSession(request, env);
}

/* RESPOSTAS JSON */

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

export function randomCredential(length = 10) {
  const chars =
    "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

  const bytes = crypto.getRandomValues(new Uint8Array(length));

  return Array.from(
    bytes,
    b => chars[b % chars.length]
  ).join("");
}
