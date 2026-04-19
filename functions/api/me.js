import { getUserFromRequest, json } from "../_utils.js";

export async function onRequestGet(context) {
  const user = await getUserFromRequest(context.request, context.env);
  if (!user) return json({ ok: false, error: "Not authenticated" }, 401);
  return json({ ok: true, user });
}
