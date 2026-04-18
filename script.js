// StudyFlow frontend-only app (no backend, no auth, localStorage only)

const STORAGE_KEY = "studyflow_data";
const app = document.getElementById("app");

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.js";
}

const state = {
  data: loadData(),
  currentClassId: null,
  activeTab: "overview",
  currentOutput: "",
};

renderApp();

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (error) {
    console.error(error);
  }

  return {
    classes: [],
    materials: {},
    notes: {},
    outputs: {},
    chats: {},
  };
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function ensureClassData(classId) {
  if (!state.data.materials[classId]) {
    state.data.materials[classId] = { uploadedFiles: [], extractedText: "" };
  }
  if (!state.data.notes[classId]) {
    state.data.notes[classId] = {
      taskType: "exam",
      materials: "",
      testStyle: "",
      emphasis: "",
      struggles: "",
      otherNotes: "",
    };
  }
  if (!state.data.outputs[classId]) state.data.outputs[classId] = {};
  if (!state.data.chats[classId]) state.data.chats[classId] = [];
}

function getClassById(id) {
  return state.data.classes.find((course) => course.id === id);
}

function renderApp() {
  if (state.currentClassId) {
    renderWorkspace();
  } else {
    renderDashboard();
  }
}

function renderDashboard() {
  const template = document.getElementById("dashboard-template");
  app.innerHTML = "";
  app.appendChild(template.content.cloneNode(true));

  const addCard = document.getElementById("add-class-card");
  const classForm = document.getElementById("class-form");
  const classGrid = document.getElementById("class-grid");

  document.getElementById("show-add-class").addEventListener("click", () => addCard.classList.remove("hidden"));
  document.getElementById("cancel-add-class").addEventListener("click", () => {
    addCard.classList.add("hidden");
    classForm.reset();
  });

  classForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(classForm));

    const classItem = {
      id: crypto.randomUUID(),
      name: (form.name || "Untitled Class").trim(),
      professor: (form.professor || "Unknown").trim(),
      taskType: form.taskType || "exam",
      examDate: form.examDate || "",
    };

    state.data.classes.unshift(classItem);
    ensureClassData(classItem.id);
    state.data.notes[classItem.id].taskType = classItem.taskType;
    persist();
    renderDashboard();
  });

  if (!state.data.classes.length) {
    classGrid.innerHTML = `<article class="card"><p class="small-note">No classes yet. Add one to begin.</p></article>`;
    return;
  }

  classGrid.innerHTML = state.data.classes
    .map((course) => {
      const readiness = calculateReadiness(course.id);
      return `
      <article class="card class-card">
        <h4>${escapeHtml(course.name)}</h4>
        <p class="small-note">Professor: ${escapeHtml(course.professor)}</p>
        <p class="small-note">Next ${course.taskType === "project" ? "Due" : "Exam"}: ${escapeHtml(course.examDate || "Not set")}</p>
        <p class="small-note">Files: ${(state.data.materials[course.id]?.uploadedFiles || []).length}</p>
        <p class="small-note">Readiness: <strong>${readiness.label}</strong> (${readiness.score}%)</p>
        <div class="form-actions">
          <button class="btn btn-primary open-class" data-id="${course.id}">Open</button>
          <button class="btn btn-danger delete-class" data-id="${course.id}">Delete</button>
        </div>
      </article>`;
    })
    .join("");

  document.querySelectorAll(".open-class").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentClassId = button.dataset.id;
      state.activeTab = "overview";
      renderApp();
    });
  });

  document.querySelectorAll(".delete-class").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      const course = getClassById(id);
      if (!course) return;
      if (!window.confirm(`Delete ${course.name}?`)) return;

      state.data.classes = state.data.classes.filter((item) => item.id !== id);
      delete state.data.materials[id];
      delete state.data.notes[id];
      delete state.data.outputs[id];
      delete state.data.chats[id];
      persist();
      renderDashboard();
    });
  });
}

function renderWorkspace() {
  const course = getClassById(state.currentClassId);
  if (!course) return renderDashboard();

  ensureClassData(course.id);

  const template = document.getElementById("workspace-template");
  app.innerHTML = "";
  app.appendChild(template.content.cloneNode(true));

  document.getElementById("workspace-title").textContent = `${course.name} Workspace`;
  document.getElementById("workspace-meta").textContent = `${course.professor} • ${course.taskType === "project" ? "Due" : "Exam"}: ${
    course.examDate || "Not set"
  }`;

  const readiness = calculateReadiness(course.id);
  document.getElementById("workspace-readiness").innerHTML = `<p class="small-note">Readiness: <strong>${readiness.label}</strong> (${readiness.score}%)</p>`;

  document.getElementById("go-dashboard").addEventListener("click", () => {
    state.currentClassId = null;
    renderApp();
  });

  document.getElementById("save-workspace").addEventListener("click", () => {
    collectNotesFromForm(course.id, course);
    persist();
    alert("Saved locally.");
  });

  renderTabs();
  renderActiveTab(course);
}

function renderTabs() {
  const tabs = [
    ["overview", "Overview"],
    ["materials", "Materials"],
    ["generators", "Study Tools"],
    ["chat", "AI Chat"],
  ];

  const nav = document.getElementById("tab-nav");
  nav.innerHTML = tabs
    .map(([key, label]) => `<button class="tab-btn ${state.activeTab === key ? "active" : ""}" data-tab="${key}">${label}</button>`)
    .join("");

  nav.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      renderWorkspace();
    });
  });
}

function renderActiveTab(course) {
  const notes = state.data.notes[course.id];
  const materials = state.data.materials[course.id];
  const outputs = state.data.outputs[course.id];
  const chats = state.data.chats[course.id];
  const tab = document.getElementById("tab-content");

  if (state.activeTab === "overview") {
    tab.innerHTML = `
      <section class="card">
        <h3>Overview</h3>
        <p>${nextStepMessage(course.id)}</p>
        <p class="small-note">Task mode: ${course.taskType === "project" ? "Project / Assignment" : "Exam"}</p>
      </section>`;
    return;
  }

  if (state.activeTab === "materials") {
    tab.innerHTML = `
      <section class="tab-content-grid">
        <article class="card">
          <h3>Notes</h3>
          <label>Type
            <select id="task-type">
              <option value="exam" ${notes.taskType === "exam" ? "selected" : ""}>Exam</option>
              <option value="project" ${notes.taskType === "project" ? "selected" : ""}>Project / Assignment</option>
            </select>
          </label>
          <label>Class Materials<textarea id="materials-input" rows="8">${escapeHtml(notes.materials)}</textarea></label>
          <label>Previous test style<textarea id="test-style" rows="3">${escapeHtml(notes.testStyle)}</textarea></label>
          <label>Professor emphasizes<textarea id="emphasis" rows="3">${escapeHtml(notes.emphasis)}</textarea></label>
          <label>What I struggle with<textarea id="struggles" rows="3">${escapeHtml(notes.struggles)}</textarea></label>
          <label>Other notes<textarea id="other-notes" rows="3">${escapeHtml(notes.otherNotes)}</textarea></label>
          <div class="form-actions">
            <button class="btn btn-primary" id="save-notes">Save Notes</button>
            <button class="btn btn-ghost" id="clear-notes">Clear</button>
          </div>
        </article>

        <article class="card">
          <h3>Upload Files</h3>
          <div class="upload-box">
            <label>Upload .txt / .pdf<input id="upload-files" type="file" accept=".txt,.pdf" multiple /></label>
            <p class="small-note">We store file names and extracted text locally only.</p>
            <p id="upload-status" class="small-note"></p>
            <ul id="file-list" class="uploaded-files">${renderFileList(materials.uploadedFiles)}</ul>
          </div>
        </article>
      </section>`;

    bindMaterialsEvents(course.id, course);
    return;
  }

  if (state.activeTab === "generators") {
    const buttons = notes.taskType === "project"
      ? `
      <button class="btn btn-primary" data-gen="studyPlan">Generate Work Timeline</button>
      <button class="btn btn-secondary" data-gen="keyTopics">Identify Priority Tasks</button>
      <button class="btn btn-secondary" data-gen="practiceQuestions">Clarifying Questions</button>
      <button class="btn btn-secondary" data-gen="summaryNotes">Deliverables Summary</button>`
      : `
      <button class="btn btn-primary" data-gen="studyPlan">Generate Study Plan</button>
      <button class="btn btn-secondary" data-gen="keyTopics">Generate Key Topics</button>
      <button class="btn btn-secondary" data-gen="practiceQuestions">Generate Practice Questions</button>
      <button class="btn btn-secondary" data-gen="summaryNotes">Generate Notes Summary</button>`;

    tab.innerHTML = `
      <section class="tab-content-grid">
        <article class="card">
          <h3>${notes.taskType === "project" ? "Project Planner" : "Exam Prep"}</h3>
          <div class="action-row">${buttons}</div>
        </article>
        <article class="card">
          <h3>Output</h3>
          <div id="generator-output" class="output-box">${escapeHtml(state.currentOutput || getLatestOutput(outputs) || "Choose a generator.")}</div>
        </article>
      </section>`;

    document.querySelectorAll("[data-gen]").forEach((button) => {
      button.addEventListener("click", () => {
        collectNotesFromForm(course.id, course);
        const type = button.dataset.gen;
        const output = generateOutput(type, course.id, course);
        outputs[type] = output;
        state.currentOutput = output;
        persist();
        document.getElementById("generator-output").textContent = output;
      });
    });
    return;
  }

  tab.innerHTML = `
    <section class="tab-content-grid">
      <article class="card">
        <h3>AI Chat (Mock)</h3>
        <div class="action-row">
          <button class="btn btn-secondary prompt">Explain this topic simply</button>
          <button class="btn btn-secondary prompt">Quiz me on this class</button>
          <button class="btn btn-secondary prompt">What should I study next?</button>
        </div>
        <div id="chat-log" class="chat-log">${renderChat(chats)}</div>
      </article>
      <article class="card">
        <h3>Ask</h3>
        <label>Your question<textarea id="chat-input" rows="6"></textarea></label>
        <button id="send-chat" class="btn btn-primary">Send</button>
      </article>
    </section>`;

  bindChatEvents(course.id, course);
}

function bindMaterialsEvents(classId, course) {
  document.getElementById("save-notes").addEventListener("click", () => {
    collectNotesFromForm(classId, course);
    persist();
    alert("Notes saved.");
  });

  document.getElementById("clear-notes").addEventListener("click", () => {
    if (!window.confirm("Clear all note text?")) return;

    state.data.notes[classId].materials = "";
    state.data.notes[classId].testStyle = "";
    state.data.notes[classId].emphasis = "";
    state.data.notes[classId].struggles = "";
    state.data.notes[classId].otherNotes = "";
    persist();
    renderWorkspace();
  });

  document.querySelectorAll(".remove-file").forEach((button) => {
    button.addEventListener("click", () => {
      state.data.materials[classId].uploadedFiles.splice(Number(button.dataset.index), 1);
      persist();
      renderWorkspace();
    });
  });

  document.getElementById("upload-files").addEventListener("change", async (event) => {
    const status = document.getElementById("upload-status");
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    status.textContent = "Processing files...";

    for (const file of files) {
      const ext = file.name.toLowerCase().split(".").pop();
      let extracted = "";

      if (ext === "txt") {
        extracted = await file.text();
      } else if (ext === "pdf") {
        try {
          extracted = await extractPdfText(file);
        } catch {
          extracted = "(PDF extraction failed. You can paste text manually.)";
          status.textContent = "Some PDF text could not be read cleanly.";
        }
      } else {
        continue;
      }

      state.data.notes[classId].materials = `${state.data.notes[classId].materials}\n\n[${ext.toUpperCase()}: ${file.name}]\n${extracted}`.trim();
      state.data.materials[classId].uploadedFiles.push({ name: file.name, type: ext, text: extracted });
    }

    persist();
    if (status.textContent === "Processing files...") status.textContent = `Uploaded ${files.length} file(s).`;
    renderWorkspace();
  });
}

function bindChatEvents(classId, course) {
  document.querySelectorAll(".prompt").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("chat-input").value = button.textContent;
    });
  });

  document.getElementById("send-chat").addEventListener("click", () => {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;

    const reply = tutorReply(course.id, text);
    state.data.chats[classId].push({ role: "user", message: text });
    state.data.chats[classId].push({ role: "assistant", message: reply });
    persist();
    renderWorkspace();
  });
}

function renderChat(messages) {
  if (!messages.length) return `<p class="small-note">No chat yet.</p>`;
  return messages.map((msg) => `<div class="chat-msg ${msg.role}">${escapeHtml(msg.message)}</div>`).join("");
}

function tutorReply(classId, text) {
  const notes = state.data.notes[classId];
  const topics = extractTopics(notes.materials);
  const q = text.toLowerCase();

  if (q.includes("quiz")) {
    return `Quick quiz:\n1) Explain ${topics[0] || "a core topic"}.\n2) Compare ${topics[1] || "topic A"} and ${topics[2] || "topic B"}.\n3) Give one example.`;
  }

  if (q.includes("next") || q.includes("study")) {
    return `Next focus: ${splitPoints(notes.struggles, 2).join(", ") || "your weakest chapter"}, then reinforce ${
      splitPoints(notes.emphasis, 2).join(", ") || "professor-priority concepts"
    }.`;
  }

  return `Start simple: define ${topics[0] || "the main idea"}, connect it to ${topics[1] || "a related concept"}, then test recall without notes.`;
}

function collectNotesFromForm(classId, course) {
  const notes = state.data.notes[classId];
  const taskType = document.getElementById("task-type");
  const materials = document.getElementById("materials-input");
  if (!taskType || !materials) return;

  notes.taskType = taskType.value;
  notes.materials = materials.value.trim();
  notes.testStyle = document.getElementById("test-style").value.trim();
  notes.emphasis = document.getElementById("emphasis").value.trim();
  notes.struggles = document.getElementById("struggles").value.trim();
  notes.otherNotes = document.getElementById("other-notes").value.trim();

  course.taskType = notes.taskType;
}

function generateOutput(type, classId, course) {
  const notes = state.data.notes[classId];
  const topics = extractTopics(`${notes.materials}\n${notes.struggles}\n${notes.emphasis}`);
  const days = Math.max(1, daysUntil(course.examDate));

  if (type === "studyPlan") {
    const total = Math.min(days, 14);
    const lines = [];
    const hard = topics.filter(isHardTopic).slice(0, 3);

    for (let day = 1; day <= total; day += 1) {
      const topic = topics[(day - 1) % Math.max(1, topics.length)] || "core topic review";
      const mins = day <= Math.ceil(total * 0.4) ? 90 : day <= Math.ceil(total * 0.8) ? 75 : 60;
      let line = `Day ${day}: ${topic} (${mins} min)`;
      if (day === total || day % 4 === 0) line += " • Review day";
      if (isHardTopic(topic)) line += " • harder topic (start early)";
      lines.push(`- ${line}`);
    }

    return `${notes.taskType === "project" ? "Work Timeline" : "Study Plan"}
Days until target: ${days}
Harder topics: ${hard.join(", ") || "None detected yet"}

Daily breakdown:
${lines.join("\n")}`;
  }

  if (type === "keyTopics") {
    return `Key Topics To Focus On\n${topics.slice(0, 8).map((topic, idx) => `${idx + 1}) ${topic}`).join("\n") || "Add more materials for better topic extraction."}`;
  }

  if (type === "practiceQuestions") {
    return `Practice Questions\n1) Explain ${topics[0] || "a key concept"}.\n2) Compare ${topics[1] || "topic A"} and ${topics[2] || "topic B"}.\n3) Apply ${topics[3] || "a concept"} to a real scenario.`;
  }

  return `Notes Summary\n- Main themes: ${topics.slice(0, 5).join(", ") || "No major topics yet"}\n- Professor emphasis: ${splitPoints(
    notes.emphasis,
    3
  ).join(", ") || "Not provided"}\n- Weak areas to revisit: ${splitPoints(notes.struggles, 3).join(", ") || "Not provided"}`;
}

function renderFileList(files) {
  if (!files.length) return "<li>No files uploaded yet.</li>";
  return files
    .map(
      (file, index) =>
        `<li class="file-row"><span>${escapeHtml(file.name)} (${file.type})</span><button class="btn btn-danger remove-file" data-index="${index}">Remove</button></li>`
    )
    .join("");
}

function calculateReadiness(classId) {
  const notes = state.data.notes[classId];
  const outputs = state.data.outputs[classId];
  const files = state.data.materials[classId].uploadedFiles;

  const checks = [
    files.length > 0,
    notes.materials.trim().length > 0,
    notes.struggles.trim().length > 0,
    Boolean(outputs.studyPlan),
    Boolean(outputs.practiceQuestions),
    Boolean(outputs.summaryNotes),
  ];

  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return { score, label: score >= 70 ? "High" : score >= 40 ? "Medium" : "Low" };
}

function nextStepMessage(classId) {
  const readiness = calculateReadiness(classId);
  if (readiness.label === "Low") return "Start by adding materials and weak areas, then generate your first plan.";
  if (readiness.label === "Medium") return "Generate missing outputs and run a short self-quiz in chat.";
  return "Great progress. Use review days to reinforce weak topics.";
}

function getLatestOutput(outputs) {
  return outputs.studyPlan || outputs.keyTopics || outputs.practiceQuestions || outputs.summaryNotes || "";
}

function extractTopics(text) {
  if (!text.trim()) return [];
  const parts = text
    .split(/\n|\.|,|;/)
    .map((part) => part.trim())
    .filter((part) => part.length > 4)
    .slice(0, 20);

  const unique = [];
  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (!unique.some((item) => item.toLowerCase() === normalized)) unique.push(part);
  }
  return unique;
}

function splitPoints(text, max) {
  if (!text.trim()) return [];
  return text
    .split(/\n|\.|,|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function isHardTopic(topic) {
  const hardWords = ["proof", "algorithm", "derivation", "equation", "analysis", "model", "theory"];
  const lower = topic.toLowerCase();
  return hardWords.some((word) => lower.includes(word)) || topic.length > 35;
}

function daysUntil(date) {
  if (!date) return 7;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(`${date}T00:00:00`);
  return Math.max(1, Math.ceil((end - start) / 86400000));
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) throw new Error("PDF.js unavailable");

  const data = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data }).promise;
  let text = "";

  for (let page = 1; page <= pdf.numPages; page += 1) {
    const p = await pdf.getPage(page);
    const c = await p.getTextContent();
    text += `\n[Page ${page}] ${c.items.map((item) => ("str" in item ? item.str : "")).join(" ")}`;
  }

  return text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
