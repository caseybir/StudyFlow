import { json, readJson, requireUser } from "../_utils.js";

export async function onRequestGet(context) {
  const auth = await requireUser(context.request, context.env);
  if (auth.error) return auth.error;

  const url = new URL(context.request.url);
  const classId = url.searchParams.get("classId") || "";
  if (!classId) return json({ ok: false, error: "classId required" }, 400);

  const rows = await context.env.DB.prepare(
    "SELECT role, message, created_at FROM chats WHERE class_id = ? AND user_id = ? ORDER BY created_at ASC"
  )
    .bind(classId, auth.user.id)
    .all();

  return json({ ok: true, chats: rows.results || [] });
}

export async function onRequestPost(context) {
  const auth = await requireUser(context.request, context.env);
  if (auth.error) return auth.error;

  const { classId, role, message } = await readJson(context.request);
  const owned = await context.env.DB.prepare("SELECT id FROM classes WHERE id = ? AND user_id = ?")
    .bind(classId, auth.user.id)
    .first();

  if (!owned) return json({ ok: false, error: "Class not found" }, 404);

  await context.env.DB.prepare("INSERT INTO chats (id, class_id, user_id, role, message) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), classId, auth.user.id, role || "user", message || "")
    .run();

  return json({ ok: true });
}
