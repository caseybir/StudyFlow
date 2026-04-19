import { authCookie, createSession, json, readJson, verifyPassword } from "../_utils.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  const { email, password } = await readJson(request);

  const user = await env.DB.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").bind((email || "").toLowerCase()).first();
  if (!user) return json({ ok: false, error: "Invalid credentials." }, 401);

  const valid = await verifyPassword(password || "", user.password_hash);
  if (!valid) return json({ ok: false, error: "Invalid credentials." }, 401);

  const token = await createSession(env, user.id);
  return new Response(JSON.stringify({ ok: true, user: { id: user.id, email: user.email } }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": authCookie(token),
    },
  });
}
