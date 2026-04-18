import { authCookie, createSession, hashPassword, json, readJson } from "../_utils.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  const { email, password } = await readJson(request);

  if (!email || !password || password.length < 8) {
    return json({ ok: false, error: "Email and password (min 8 chars) are required." }, 400);
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email.toLowerCase()).first();
  if (existing) return json({ ok: false, error: "Email already exists." }, 409);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await env.DB.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)")
    .bind(id, email.toLowerCase(), passwordHash)
    .run();

  const token = await createSession(env, id);
  return new Response(JSON.stringify({ ok: true, user: { id, email: email.toLowerCase() } }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": authCookie(token),
    },
  });
}
