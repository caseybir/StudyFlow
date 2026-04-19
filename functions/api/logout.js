import { clearAuthCookie, json, parseCookies } from "../_utils.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  const token = parseCookies(request).studyflow_session;
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearAuthCookie(),
    },
  });
}
