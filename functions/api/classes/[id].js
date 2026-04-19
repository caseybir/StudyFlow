import { json, readJson, requireUser } from "../../_utils.js";

async function ownerCheck(env, classId, userId) {
  return env.DB.prepare("SELECT id FROM classes WHERE id = ? AND user_id = ?").bind(classId, userId).first();
}

export async function onRequestPut(context) {
  const auth = await requireUser(context.request, context.env);
  if (auth.error) return auth.error;

  const classId = context.params.id;
  const owned = await ownerCheck(context.env, classId, auth.user.id);
  if (!owned) return json({ ok: false, error: "Not found" }, 404);

  const body = await readJson(context.request);
  await context.env.DB.prepare(
    `UPDATE classes
     SET class_name = ?, professor = ?, exam_date = ?, task_type = ?, tag = ?, inputs_json = ?, outputs_json = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  )
    .bind(
      body.className || "Untitled Class",
      body.professor || "Unknown",
      body.examDate || null,
      body.taskType || "exam",
      body.tag || "",
      JSON.stringify(body.inputs || {}),
      JSON.stringify(body.outputs || {}),
      classId,
      auth.user.id
    )
    .run();

  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const auth = await requireUser(context.request, context.env);
  if (auth.error) return auth.error;

  const classId = context.params.id;
  await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM chats WHERE class_id = ? AND user_id = ?").bind(classId, auth.user.id),
    context.env.DB.prepare("DELETE FROM outputs WHERE class_id = ? AND user_id = ?").bind(classId, auth.user.id),
    context.env.DB.prepare("DELETE FROM materials WHERE class_id = ? AND user_id = ?").bind(classId, auth.user.id),
    context.env.DB.prepare("DELETE FROM classes WHERE id = ? AND user_id = ?").bind(classId, auth.user.id),
  ]);

  return json({ ok: true });
}
