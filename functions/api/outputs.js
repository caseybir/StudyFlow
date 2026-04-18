import { json, readJson, requireUser } from "../_utils.js";

export async function onRequestPost(context) {
  const auth = await requireUser(context.request, context.env);
  if (auth.error) return auth.error;

  const { classId, outputType, content } = await readJson(context.request);
  const owned = await context.env.DB.prepare("SELECT id FROM classes WHERE id = ? AND user_id = ?")
    .bind(classId, auth.user.id)
    .first();

  if (!owned) return json({ ok: false, error: "Class not found" }, 404);

  await context.env.DB.prepare(
    "INSERT INTO outputs (id, class_id, user_id, output_type, content) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(crypto.randomUUID(), classId, auth.user.id, outputType || "unknown", content || "")
    .run();

  return json({ ok: true });
}
