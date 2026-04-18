
-- StudyFlow D1 schema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  class_name TEXT NOT NULL,
  professor TEXT,
  exam_date TEXT,
  task_type TEXT NOT NULL DEFAULT 'exam',
  tag TEXT,
  inputs_json TEXT,
  outputs_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_text TEXT,
  file_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS outputs (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  output_type TEXT NOT NULL,
  content TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_classes_user ON classes(user_id);
CREATE INDEX IF NOT EXISTS idx_materials_class ON materials(class_id);
CREATE INDEX IF NOT EXISTS idx_outputs_class ON outputs(class_id);
CREATE INDEX IF NOT EXISTS idx_chats_class ON chats(class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
