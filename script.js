const API = {
  signup: "/api/signup",
  login: "/api/login",
  logout: "/api/logout",
  me: "/api/me",
  classes: "/api/classes",
  materials: "/api/materials",
  outputs: "/api/outputs",
  chats: "/api/chats",
};

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.js";
}

const authView = document.getElementById("auth-view");
const appView = document.getElementById("app-view");

const state = {
  user: null,
  classes: [],
  currentClassId: null,
  activeTab: "overview",
};

boot();

async function boot() {
  const me = await apiGet(API.me);
  if (me.ok) {
    state.user = me.user;
    await loadClasses();
    renderDashboard();
  } else {
    renderAuth();
  }
}

// -----------------------------
// Auth
// -----------------------------
function renderAuth() {
  appView.classList.add("hidden");
  authView.classList.remove("hidden");
  const template = document.getElementById("auth-template");
  authView.innerHTML = "";
  authView.appendChild(template.content.cloneNode(true));

  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const message = document.getElementById("auth-message");

  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-auth-tab]").forEach((tab) => tab.classList.remove("active"));
      button.classList.add("active");
      const showLogin = button.dataset.authTab === "login";
      loginForm.classList.toggle("hidden", !showLogin);
      signupForm.classList.toggle("hidden", showLogin);
      message.textContent = "";
    });
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm));
    const result = await apiPost(API.login, data);
    if (!result.ok) {
      message.textContent = result.error || "Login failed.";
      return;
    }

    state.user = result.user;
    await loadClasses();
    renderDashboard();
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(signupForm));
    const result = await apiPost(API.signup, data);
    if (!result.ok) {
      message.textContent = result.error || "Signup failed.";
      return;
    }

    state.user = result.user;
    await loadClasses();
    renderDashboard();
  });
}

async function logout() {
  await apiPost(API.logout, {});
  state.user = null;
  state.classes = [];
  state.currentClassId = null;
  renderAuth();
}

// -----------------------------
// Classes and app views
// -----------------------------
async function loadClasses() {
  const response = await apiGet(API.classes);
  if (!response.ok) {
    state.classes = [];
    return;
  }

  state.classes = response.classes.map(ensureClassShape);
}

function ensureClassShape(item) {
  return {
    ...item,
    inputs: item.inputs || {
      materials: "",
      testStyle: "",
      emphasis: "",
      struggles: "",
      otherNotes: "",
      uploadedFiles: [],
    },
    outputs: item.outputs || {},
    chatHistory: item.chatHistory || [],
  };
}

function getCurrentClass() {
  return state.classes.find((course) => course.id === state.currentClassId);
}

function renderDashboard() {
  authView.classList.add("hidden");
  appView.classList.remove("hidden");

  const template = document.getElementById("dashboard-template");
  appView.innerHTML = "";
  appView.appendChild(template.content.cloneNode(true));

  document.getElementById("user-email").textContent = state.user.email;
  document.getElementById("logout-btn").addEventListener("click", logout);

  const classGrid = document.getElementById("class-grid");
  const addPanel = document.getElementById("add-class-panel");
  const classForm = document.getElementById("class-form");

  document.getElementById("open-add-class").addEventListener("click", () => addPanel.classList.remove("hidden"));
  document.getElementById("cancel-add-class").addEventListener("click", () => {
    addPanel.classList.add("hidden");
    classForm.reset();
  });

  classForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(classForm));
    const result = await apiPost(API.classes, form);
    if (!result.ok) return alert(result.error || "Could not create class");

    state.classes.unshift(ensureClassShape(result.classItem));
    renderDashboard();
  });

  if (!state.classes.length) {
    classGrid.innerHTML = `<article class="card"><p class="small-note">No classes yet. Add one to start.</p></article>`;
    return;
  }

  classGrid.innerHTML = state.classes
    .map((course) => {
      const readiness = calculateReadiness(course);
      return `
      <article class="card class-card" style="border-left-color:${pickTagColor(course.tag)}">
        <div class="file-row"><h4>${escapeHtml(course.name)}</h4><span class="badge ${readiness.label.toLowerCase()}">${readiness.label}</span></div>
        <p class="card-meta">Professor: ${escapeHtml(course.professor || "-")}</p>
        <p class="card-meta">Next ${course.taskType === "project" ? "Due" : "Exam"}: ${escapeHtml(course.examDate || "Not set")}</p>
        <p class="card-meta">Files: ${course.inputs.uploadedFiles.length}</p>
        <div class="progress"><span style="width:${readiness.score}%"></span></div>
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
      renderWorkspace();
    });
  });

  document.querySelectorAll(".delete-class").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;
      const item = state.classes.find((course) => course.id === id);
      if (!item) return;
      if (!window.confirm(`Delete ${item.name}?`)) return;

      const deleted = await apiDelete(`${API.classes}/${id}`);
      if (!deleted.ok) return alert("Failed to delete class.");

      state.classes = state.classes.filter((course) => course.id !== id);
      renderDashboard();
    });
  });
}

function renderWorkspace() {
  const course = getCurrentClass();
  if (!course) return renderDashboard();

  const template = document.getElementById("workspace-template");
  appView.innerHTML = "";
  appView.appendChild(template.content.cloneNode(true));

  document.getElementById("workspace-title").textContent = `${course.name} Workspace`;
  document.getElementById("workspace-meta").textContent = `${course.professor} • ${course.taskType === "project" ? "Due" : "Exam"}: ${
    course.examDate || "Not set"
  }`;

  renderReadiness(course);
  renderTabNav();
  renderActiveTab(course);

  document.getElementById("back-dashboard").addEventListener("click", renderDashboard);
  document.getElementById("save-class").addEventListener("click", () => saveClass(course, true));
}

function renderReadiness(course) {
  const readiness = calculateReadiness(course);
  document.getElementById("workspace-readiness").innerHTML = `
    <div class="card">
      <div class="file-row"><strong>Readiness</strong><span class="badge ${readiness.label.toLowerCase()}">${readiness.label}</span></div>
      <div class="progress"><span style="width:${readiness.score}%"></span></div>
      <p class="small-note">Files: ${course.inputs.uploadedFiles.length} • Notes sections: ${countNotes(course.inputs)} • Outputs: ${Object.keys(
    course.outputs
  ).length}</p>
    </div>`;
}

function renderTabNav() {
  const tabs = [
    ["overview", "Overview"],
    ["materials", "Materials"],
    ["exam", "Exam Prep"],
    ["assignment", "Assignments"],
    ["chat", "Tutor Chat"],
  ];

  const tabNav = document.getElementById("tab-nav");
  tabNav.innerHTML = tabs
    .map(([key, label]) => `<button class="tab-btn ${state.activeTab === key ? "active" : ""}" data-tab="${key}">${label}</button>`)
    .join("");

  tabNav.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      renderWorkspace();
    });
  });
}

function renderActiveTab(course) {
  const target = document.getElementById("tab-content");

  if (state.activeTab === "overview") {
    target.innerHTML = `<section class="card"><h3>Overview</h3><p>${nextActionMessage(course)}</p></section>`;
    return;
  }

  if (state.activeTab === "materials") {
    target.innerHTML = renderMaterialsTab(course);
    bindMaterialsTab(course);
    return;
  }

  if (state.activeTab === "exam") {
    target.innerHTML = renderGeneratorsTab(course, "exam");
    bindGeneratorTab(course);
    return;
  }

  if (state.activeTab === "assignment") {
    target.innerHTML = renderGeneratorsTab(course, "assignment");
    bindGeneratorTab(course);
    return;
  }

  target.innerHTML = renderChatTab(course);
  bindChatTab(course);
}

function renderMaterialsTab(course) {
  return `
  <section class="tab-panel-grid">
    <article class="card">
      <h3>Notes & Inputs</h3>
      <label>Task Type
        <select id="task-type">
          <option value="exam" ${course.taskType === "exam" ? "selected" : ""}>Exam</option>
          <option value="project" ${course.taskType === "project" ? "selected" : ""}>Project / Assignment</option>
        </select>
      </label>
      <label>Class Materials<textarea id="materials" rows="8">${escapeHtml(course.inputs.materials)}</textarea></label>
      <label>Previous test style<textarea id="test-style" rows="3">${escapeHtml(course.inputs.testStyle)}</textarea></label>
      <label>Professor emphasizes<textarea id="emphasis" rows="3">${escapeHtml(course.inputs.emphasis)}</textarea></label>
      <label>What I struggle with<textarea id="struggles" rows="3">${escapeHtml(course.inputs.struggles)}</textarea></label>
      <label>Other notes<textarea id="other-notes" rows="3">${escapeHtml(course.inputs.otherNotes)}</textarea></label>
      <div class="form-actions">
        <button class="btn btn-primary" id="save-notes">Save Notes</button>
        <button class="btn btn-ghost" id="clear-notes">Clear Notes</button>
      </div>
    </article>

    <article class="card">
      <h3>Upload Files</h3>
      <div class="upload-box">
        <label>Upload .txt and .pdf<input id="upload-input" type="file" accept=".txt,.pdf" multiple /></label>
        <p class="small-note">PDF text extraction happens in your browser with PDF.js.</p>
        <p id="upload-status" class="small-note"></p>
        <ul class="uploaded-files" id="uploaded-list">${renderUploadList(course)}</ul>
      </div>
    </article>
  </section>`;
}

function bindMaterialsTab(course) {
  document.getElementById("task-type").addEventListener("change", (event) => {
    course.taskType = event.target.value;
  });

  document.getElementById("save-notes").addEventListener("click", async () => {
    hydrateInputsFromForm(course);
    await saveClass(course, true);
  });

  document.getElementById("clear-notes").addEventListener("click", async () => {
    if (!window.confirm("Clear notes?")) return;
    course.inputs.materials = "";
    course.inputs.testStyle = "";
    course.inputs.emphasis = "";
    course.inputs.struggles = "";
    course.inputs.otherNotes = "";
    await saveClass(course, true);
  });

  document.getElementById("upload-input").addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    const status = document.getElementById("upload-status");
    if (!files.length) return;

    status.textContent = "Processing files...";
    for (const file of files) {
      const ext = file.name.toLowerCase().split(".").pop();
      let contentText = "";

      if (ext === "txt") {
        contentText = await file.text();
      } else if (ext === "pdf") {
        try {
          contentText = await extractPdfText(file);
        } catch {
          contentText = "(PDF extraction failed or unreadable.)";
          status.textContent = "Some PDF text could not be extracted cleanly.";
        }
      } else {
        continue;
      }

      course.inputs.materials = `${course.inputs.materials}\n\n[${ext.toUpperCase()}: ${file.name}]\n${contentText}`.trim();
      course.inputs.uploadedFiles.push({ name: file.name, type: ext });

      await apiPost(API.materials, {
        classId: course.id,
        fileName: file.name,
        fileType: ext,
        contentText,
      });
    }

    await saveClass(course, false);
    renderWorkspace();
  });

  document.querySelectorAll(".remove-upload").forEach((button) => {
    button.addEventListener("click", async () => {
      course.inputs.uploadedFiles.splice(Number(button.dataset.index), 1);
      await saveClass(course, true);
    });
  });
}

function renderUploadList(course) {
  if (!course.inputs.uploadedFiles.length) return "<li>No files uploaded yet.</li>";

  return course.inputs.uploadedFiles
    .map(
      (file, index) =>
        `<li class="file-row"><span>${escapeHtml(file.name)} (${file.type})</span><button class="btn btn-danger remove-upload" data-index="${index}">Remove</button></li>`
    )
    .join("");
}

function renderGeneratorsTab(course, section) {
  const examButtons = `
    <button class="btn btn-primary" data-gen="studyPlan">Generate Study Plan</button>
    <button class="btn btn-secondary" data-gen="summaryNotes">Generate Summary Notes</button>
    <button class="btn btn-secondary" data-gen="practiceQuestions">Generate Practice Questions</button>
    <button class="btn btn-secondary" data-gen="flashcards">Generate Flashcards</button>`;

  const projectButtons = `
    <button class="btn btn-primary" data-gen="assignmentSteps">Break Assignment Into Steps</button>
    <button class="btn btn-secondary" data-gen="workTimeline">Generate Work Timeline</button>
    <button class="btn btn-secondary" data-gen="deliverables">Create Deliverables Checklist</button>
    <button class="btn btn-secondary" data-gen="clarifyQuestions">Identify Questions to Clarify</button>`;

  const showExam = section === "exam";
  const output = state.lastOutput || "Choose a generator.";

  return `
    <section class="tab-panel-grid">
      <article class="card">
        <h3>${showExam ? "Exam Prep" : "Assignment Planner"}</h3>
        <p class="small-note">Task mode: ${course.taskType === "project" ? "Project / Assignment" : "Exam"}</p>
        <div class="action-row">${showExam ? examButtons : projectButtons}</div>
      </article>
      <article class="card">
        <h3>Output</h3>
        <div class="output-box" id="generator-output">${escapeHtml(output)}</div>
      </article>
    </section>`;
}

function bindGeneratorTab(course) {
  document.querySelectorAll("[data-gen]").forEach((button) => {
    button.addEventListener("click", async () => {
      hydrateInputsFromForm(course);
      const type = button.dataset.gen;
      const content = generateOutput(type, course);
      course.outputs[type] = content;
      state.lastOutput = content;

      await apiPost(API.outputs, {
        classId: course.id,
        outputType: type,
        content,
      });

      await saveClass(course, false);
      const out = document.getElementById("generator-output");
      if (out) out.textContent = content;
    });
  });
}

function generateOutput(type, course) {
  const i = course.inputs;
  const topics = extractTopics(i.materials + "\n" + i.struggles + "\n" + i.emphasis);
  const daysLeft = daysUntil(course.examDate);

  if (type === "studyPlan") {
    return `Smart Study Plan\nDays left: ${daysLeft}\nRecommended time/day: ${daysLeft <= 4 ? 120 : 75} minutes\n\nHigh priority topics:\n- ${
      topics.slice(0, 4).join("\n- ") || "Core concepts + weak areas"
    }\n\nDay-by-day schedule:\n${buildDayPlan(topics, daysLeft, i)}\n\nFinal review day: ${Math.max(1, daysLeft)} (light recap + active recall + confidence pass).`;
  }

  if (type === "summaryNotes") {
    return `Summary Notes\n\nKey themes:\n${topics
      .slice(0, 6)
      .map((topic, idx) => `${idx + 1}) ${topic}`)
      .join("\n")}\n\nLikely testable:\n- ${splitPoints(i.emphasis, 4).join("\n- ") || "Definitions, frameworks, applications"}`;
  }

  if (type === "practiceQuestions") {
    return `Practice Questions\n1) Conceptual: Explain ${topics[0] || "a key topic"}.\n2) Short answer: Compare ${topics[1] || "topic A"} and ${
      topics[2] || "topic B"
    }.\n3) Application: Solve a realistic scenario using ${topics[3] || "class methods"}.`;
  }

  if (type === "flashcards") {
    return topics
      .slice(0, 8)
      .map((topic, idx) => `Card ${idx + 1}\nFront: ${topic}?\nBack: Define, explain, and give one example.`)
      .join("\n\n");
  }

  if (type === "assignmentSteps") {
    return `Assignment Steps\n1) Clarify rubric\n2) Build outline\n3) Draft core sections\n4) Add evidence/examples\n5) Revise and submit.`;
  }

  if (type === "workTimeline") {
    return `Work Timeline\nDays to due date: ${Math.max(1, daysLeft)}\n- 0-30%: planning\n- 30-70%: execution\n- 70-100%: polish + submission checks`;
  }

  if (type === "deliverables") {
    return `Deliverables Checklist\n☐ Scope understood\n☐ Outline created\n☐ Draft complete\n☐ QA / proofreading done\n☐ Submitted`; 
  }

  return `Questions to Clarify\n1) Top grading criteria?\n2) Required format?\n3) Required sources/tools?\n4) Collaboration policy?`;
}

function buildDayPlan(topics, daysLeft, inputs) {
  const total = Math.max(1, daysLeft);
  const style = (inputs.testStyle || "mixed").toLowerCase();
  const plan = [];

  for (let day = 1; day <= total; day += 1) {
    const topic = topics[(day - 1) % Math.max(1, topics.length)] || "core topic review";
    let line = `Day ${day}: ${topic}`;
    if (day <= Math.ceil(total * 0.4)) line += " (deep understanding + weak-area focus)";
    else if (day <= Math.ceil(total * 0.8)) line += " (practice questions + recall drills)";
    else line += " (reinforcement + exam simulation)";

    if (style.includes("concept")) line += " + conceptual explanation drills";
    if (style.includes("problem") || style.includes("calc")) line += " + problem-solving sets";
    plan.push(`- ${line}`);
  }

  return plan.join("\n");
}

function renderChatTab(course) {
  return `
    <section class="tab-panel-grid">
      <article class="card">
        <h3>Tutor Chat</h3>
        <div class="action-row">
          <button class="btn btn-secondary prompt">Explain this topic simply</button>
          <button class="btn btn-secondary prompt">Quiz me on this class</button>
          <button class="btn btn-secondary prompt">What should I focus on next?</button>
          <button class="btn btn-secondary prompt">Help me break this assignment into steps</button>
        </div>
        <div id="chat-log" class="chat-log">${renderChatHistory(course.chatHistory)}</div>
      </article>

      <article class="card">
        <h3>Ask</h3>
        <label>Your message<textarea id="chat-input" rows="7"></textarea></label>
        <button class="btn btn-primary" id="send-chat">Send</button>
      </article>
    </section>`;
}

function bindChatTab(course) {
  document.querySelectorAll(".prompt").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("chat-input").value = button.textContent;
    });
  });

  document.getElementById("send-chat").addEventListener("click", async () => {
    const input = document.getElementById("chat-input");
    const message = input.value.trim();
    if (!message) return;

    const reply = generateTutorReply(course, message);
    course.chatHistory.push({ role: "user", message });
    course.chatHistory.push({ role: "assistant", message: reply });

    await apiPost(API.chats, {
      classId: course.id,
      role: "user",
      message,
    });
    await apiPost(API.chats, {
      classId: course.id,
      role: "assistant",
      message: reply,
    });

    await saveClass(course, false);
    renderWorkspace();
  });
}

function generateTutorReply(course, text) {
  const q = text.toLowerCase();
  const topics = extractTopics(course.inputs.materials);

  if (q.includes("quiz")) return `Quick quiz: define ${topics[0] || "a key concept"}, compare with ${topics[1] || "another concept"}, then give one example.`;
  if (q.includes("focus")) return `Focus next on: ${splitPoints(course.inputs.struggles, 2).join(", ") || "your weakest chapter"
  }, then review professor priorities: ${splitPoints(course.inputs.emphasis, 2).join(", ") || "core lecture concepts"}.`;
  if (q.includes("assignment")) return generateOutput("assignmentSteps", course);

  return `Let’s simplify this: start with ${topics[0] || "the core idea"}, connect it to ${topics[1] || "a related topic"}, and test yourself with one short explanation.`;
}

function renderChatHistory(history) {
  if (!history.length) return "<p class='small-note'>No messages yet.</p>";
  return history.map((m) => `<div class='chat-msg ${m.role}'>${escapeHtml(m.message)}</div>`).join("");
}

async function saveClass(course, rerender) {
  hydrateInputsFromForm(course);
  const result = await apiPut(`${API.classes}/${course.id}`, {
    className: course.name,
    professor: course.professor,
    examDate: course.examDate,
    taskType: course.taskType,
    tag: course.tag,
    inputs: course.inputs,
    outputs: course.outputs,
  });

  if (!result.ok) return alert(result.error || "Failed to save class.");
  if (rerender) renderWorkspace();
}

function hydrateInputsFromForm(course) {
  const materials = document.getElementById("materials");
  if (!materials) return;
  course.inputs.materials = materials.value.trim();
  course.inputs.testStyle = document.getElementById("test-style").value.trim();
  course.inputs.emphasis = document.getElementById("emphasis").value.trim();
  course.inputs.struggles = document.getElementById("struggles").value.trim();
  course.inputs.otherNotes = document.getElementById("other-notes").value.trim();
  course.taskType = document.getElementById("task-type").value;
}

function calculateReadiness(course) {
  const checks = [
    course.inputs.uploadedFiles.length > 0,
    countNotes(course.inputs) >= 2,
    Boolean(course.outputs.studyPlan),
    Boolean(course.outputs.practiceQuestions),
    Boolean(course.outputs.flashcards),
    Boolean(course.outputs.assignmentSteps || course.outputs.workTimeline),
  ];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return { score, label: score >= 70 ? "High" : score >= 40 ? "Medium" : "Low" };
}

function countNotes(inputs) {
  return [inputs.materials, inputs.testStyle, inputs.emphasis, inputs.struggles, inputs.otherNotes].filter((x) => x?.trim()).length;
}

function nextActionMessage(course) {
  const r = calculateReadiness(course);
  if (r.label === "Low") return "Add materials and generate your first plan.";
  if (r.label === "Medium") return "Generate missing outputs and run a tutor quiz.";
  return "Great job. Keep reinforcing weak areas with active recall.";
}

function extractTopics(text) {
  if (!text.trim()) return [];
  const parts = text
    .split(/\n|\.|,|;/)
    .map((p) => p.trim())
    .filter((p) => p.length > 4)
    .slice(0, 12);

  const unique = [];
  for (const part of parts) {
    const norm = part.toLowerCase();
    if (!unique.some((item) => item.toLowerCase() === norm)) unique.push(part);
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

async function extractPdfText(file) {
  if (!window.pdfjsLib) throw new Error("PDF.js unavailable");
  const bytes = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
  let text = "";
  for (let page = 1; page <= pdf.numPages; page += 1) {
    const p = await pdf.getPage(page);
    const c = await p.getTextContent();
    text += `\n[Page ${page}] ${c.items.map((item) => ("str" in item ? item.str : "")).join(" ")}`;
  }
  return text;
}

function daysUntil(date) {
  if (!date) return 0;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(`${date}T00:00:00`);
  return Math.max(0, Math.ceil((end - start) / 86400000));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pickTagColor(tag) {
  const palette = ["#4f46e5", "#0f766e", "#0284c7", "#9333ea", "#db2777", "#b45309"];
  if (!tag) return palette[0];
  const sum = tag.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

async function apiGet(url) {
  try {
    const response = await fetch(url, { credentials: "include" });
    return await response.json();
  } catch {
    return { ok: false, error: "Network error" };
  }
}

async function apiPost(url, body) {
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await response.json();
  } catch {
    return { ok: false, error: "Network error" };
  }
}

async function apiPut(url, body) {
  try {
    const response = await fetch(url, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await response.json();
  } catch {
    return { ok: false, error: "Network error" };
  }
}

async function apiDelete(url) {
  try {
    const response = await fetch(url, { method: "DELETE", credentials: "include" });
    return await response.json();
  } catch {
    return { ok: false, error: "Network error" };
  }
}
