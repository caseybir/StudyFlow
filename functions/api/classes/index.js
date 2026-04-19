import { json, readJson, requireUser } from "../../_utils.js";

export async function onRequestGet(context) {
  const auth = await requireUser(context.request, context.env);
  if (auth.error) return auth.error;

  const rows = await context.env.DB.prepare(
    `SELECT id, class_name, professor, exam_date, task_type, tag, inputs_json, outputs_json, created_at
     FROM classes WHERE user_id = ? ORDER BY created_at DESC`
  )
    .bind(auth.user.id)
    .all();

  const classes = (rows.results || []).map((row) => ({
    id: row.id,
    name: row.class_name,
    professor: row.professor,
    examDate: row.exam_date,
    taskType: row.task_type,
    tag: row.tag,
    inputs: row.inputs_json ? JSON.parse(row.inputs_json) : undefined,
    outputs: row.outputs_json ? JSON.parse(row.outputs_json) : undefined,
  }));

  return json({ ok: true, classes });
}

export async function onRequestPost(context) {
  const auth = await requireUser(context.request, context.env);
  if (auth.error) return auth.error;

  const body = await readJson(context.request);
  const id = crypto.randomUUID();

  await context.env.DB.prepare(
    `INSERT INTO classes (id, user_id, class_name, professor, exam_date, task_type, tag, inputs_json, outputs_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      auth.user.id,
      body.name || "Untitled Class",
      body.professor || "Unknown",
      body.examDate || null,
      body.taskType || "exam",
      body.tag || "",
      JSON.stringify({ materials: "", testStyle: "", emphasis: "", struggles: "", otherNotes: "", uploadedFiles: [] }),
      JSON.stringify({})
    )
    .run();

  return json({
    ok: true,
    classItem: {
      id,
      name: body.name || "Untitled Class",
      professor: body.professor || "Unknown",
      examDate: body.examDate || "",
      taskType: body.taskType || "exam",
      tag: body.tag || "",
      inputs: { materials: "", testStyle: "", emphasis: "", struggles: "", otherNotes: "", uploadedFiles: [] },
      outputs: {},
      chatHistory: [],
    },
  });
}
