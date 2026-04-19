const encoder = new TextEncoder();

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function parseCookies(request) {
  const cookie = request.headers.get("Cookie") || "";
  return Object.fromEntries(
    cookie
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [key, ...rest] = item.split("=");
        return [key, decodeURIComponent(rest.join("="))];
      })
  );
}

export async function hashPassword(password, salt = crypto.randomUUID()) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 150000,
      hash: "SHA-256",
    },
    key,
    256
  );
  const hash = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  const [salt] = stored.split(":");
  const attempt = await hashPassword(password, salt);
  return attempt === stored;
}

export async function createSession(env, userId) {
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expiresAt)
    .run();

  return token;
}

export async function getUserFromRequest(request, env) {
  const cookies = parseCookies(request);
  const token = cookies.studyflow_session;
  if (!token) return null;

  const row = await env.DB.prepare(
    `SELECT users.id, users.email
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ? AND sessions.expires_at > datetime('now')`
  )
    .bind(token)
    .first();

  return row || null;
}

export function authCookie(token) {
  return `studyflow_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000; Secure`;
}

export function clearAuthCookie() {
  return "studyflow_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Secure";
}

export async function requireUser(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) return { error: json({ ok: false, error: "Unauthorized" }, 401) };
  return { user };
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
