const STORAGE_KEY = "studyflow_v2";
const app = document.getElementById("app");
const topNav = document.getElementById("top-nav");
const modal = document.getElementById("item-modal");

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.js";
}

const state = {
  data: loadData(),
  activeView: "dashboard",
  monthCursor: new Date(),
  addPendingFiles: [],
  selectedStudyTaskId: null,
};

render();

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.error(error);
  }

  return {
    tasks: [],
    classes: {},
    materials: {},
    outputs: {},
    chats: {},
  };
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function render() {
  renderTopNav();

  if (state.activeView === "dashboard") return renderDashboard();
  if (state.activeView === "calendar") return renderCalendar();
  if (state.activeView === "add") return renderAddNew();
  if (state.activeView === "classes") return renderClasses();
  renderStudyTools();
}

function renderTopNav() {
  const views = [
    ["dashboard", "Dashboard"],
    ["calendar", "Calendar"],
    ["add", "Add New"],
    ["classes", "Classes"],
    ["study", "Study Tools"],
  ];

  topNav.innerHTML = views
    .map(
      ([key, label]) =>
        `<button class="btn ${state.activeView === key ? "tab-active" : "btn-ghost"}" data-view="${key}">${label}</button>`
    )
    .join("");

  topNav.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeView = button.dataset.view;
      render();
    });
  });
}

function renderDashboard() {
  const template = document.getElementById("dashboard-view");
  app.innerHTML = "";
  app.appendChild(template.content.cloneNode(true));

  const tasks = sortedByDate(state.data.tasks);
  const now = new Date();
  const upcoming = tasks.filter((task) => daysUntil(task.dueDate) >= 0).slice(0, 8);
  const highPriority = tasks.filter((task) => task.priority === "High").slice(0, 6);

  const stats = [
    ["Total Items", tasks.length],
    ["Upcoming Exams", tasks.filter((t) => t.type === "Exam" && daysUntil(t.dueDate) >= 0).length],
    ["Upcoming Projects", tasks.filter((t) => t.type === "Project" && daysUntil(t.dueDate) >= 0).length],
    ["Upcoming Assignments", tasks.filter((t) => t.type === "Assignment" && daysUntil(t.dueDate) >= 0).length],
    ["Due This Week", tasks.filter((t) => daysUntil(t.dueDate) <= 7 && daysUntil(t.dueDate) >= 0).length],
    ["Classes", Object.keys(state.data.classes).length],
  ];

  document.getElementById("stats-grid").innerHTML = stats
    .map(([label, value]) => `<article class="card stat-card"><h4>${label}</h4><p>${value}</p></article>`)
    .join("");

  document.getElementById("upcoming-list").innerHTML = renderTaskRows(upcoming, "No upcoming deadlines yet.");
  document.getElementById("priority-list").innerHTML = renderTaskRows(highPriority, "No high-priority items.");

  const recentUploads = allMaterials()
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .slice(0, 6);

  document.getElementById("recent-uploads").innerHTML = recentUploads.length
    ? recentUploads
        .map(
          (item) =>
            `<article class="item-row"><div><strong>${escapeHtml(item.fileName)}</strong><small>${escapeHtml(
              item.taskTitle
            )} • ${escapeHtml(item.className)}</small></div><span class="tag ${item.type}">${item.type}</span></article>`
        )
        .join("")
    : `<p class="muted">No uploads yet.</p>`;

  app.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeView = button.dataset.nav;
      render();
    });
  });

  bindTaskRowClicks();
}

function renderCalendar() {
  const template = document.getElementById("calendar-view");
  app.innerHTML = "";
  app.appendChild(template.content.cloneNode(true));

  const year = state.monthCursor.getFullYear();
  const month = state.monthCursor.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const firstWeekday = start.getDay();

  document.getElementById("calendar-title").textContent = start.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    const date = new Date(year, month, i - firstWeekday + 1);
    cells.push(buildCalendarCell(date, true));
  }

  for (let day = 1; day <= end.getDate(); day += 1) {
    cells.push(buildCalendarCell(new Date(year, month, day), false));
  }

  while (cells.length % 7 !== 0) {
    const overflowDay = cells.length - (firstWeekday + end.getDate()) + 1;
    cells.push(buildCalendarCell(new Date(year, month + 1, overflowDay), true));
  }

  document.getElementById("calendar-grid").innerHTML = cells.join("");

  const upcoming = sortedByDate(state.data.tasks)
    .filter((task) => daysUntil(task.dueDate) >= 0)
    .slice(0, 12);
  document.getElementById("calendar-upcoming").innerHTML = renderTaskRows(upcoming, "No upcoming deadlines.");

  document.getElementById("prev-month").addEventListener("click", () => {
    state.monthCursor = new Date(year, month - 1, 1);
    renderCalendar();
  });

  document.getElementById("next-month").addEventListener("click", () => {
    state.monthCursor = new Date(year, month + 1, 1);
    renderCalendar();
  });

  app.querySelectorAll(".cal-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const date = cell.dataset.date;
      const tasks = state.data.tasks.filter((task) => task.dueDate === date);
      if (!tasks.length) return;
      openItemDetail(tasks[0].id);
    });
  });

  bindTaskRowClicks();
}

function buildCalendarCell(date, outside) {
  const iso = toISO(date);
  const items = state.data.tasks.filter((task) => task.dueDate === iso).slice(0, 3);

  return `
    <article class="cal-cell ${outside ? "outside" : ""}" data-date="${iso}">
      <div class="cal-day">${date.getDate()}</div>
      ${items.map((task) => `<div class="cal-item ${task.type}">${escapeHtml(task.title)}</div>`).join("")}
    </article>
  `;
}

function renderAddNew() {
  const template = document.getElementById("add-view");
  app.innerHTML = "";
  app.appendChild(template.content.cloneNode(true));
  state.addPendingFiles = [];

  const uploadInput = document.getElementById("add-files");
  const uploadStatus = document.getElementById("add-upload-status");
  const uploadList = document.getElementById("add-upload-list");

  uploadInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    uploadStatus.textContent = "Reading files...";

    for (const file of files) {
      const ext = getExt(file.name);
      if (!["txt", "pdf"].includes(ext)) continue;

      let text = "";
      let failed = false;

      if (ext === "txt") {
        text = await file.text();
      } else {
        try {
          text = await extractPdfText(file);
        } catch {
          failed = true;
          text = "(PDF extraction failed; add manual notes if needed.)";
        }
      }

      state.addPendingFiles.push({
        id: crypto.randomUUID(),
        fileName: file.name,
        fileType: ext,
        text,
        failed,
      });
    }

    uploadStatus.textContent = `Prepared ${state.addPendingFiles.length} file(s).`;
    uploadList.innerHTML = state.addPendingFiles
      .map((file) => `<li>${escapeHtml(file.fileName)} ${file.failed ? "(limited extraction)" : ""}</li>`)
      .join("");
  });

  document.getElementById("reset-add").addEventListener("click", () => renderAddNew());

  document.getElementById("add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));

    const task = {
      id: crypto.randomUUID(),
      title: form.title.trim(),
      className: form.className.trim(),
      professor: (form.professor || "").trim(),
      type: form.type,
      dueDate: form.dueDate,
      priority: form.priority,
      notes: (form.notes || "").trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    state.data.tasks.push(task);
    if (!state.data.classes[task.className]) state.data.classes[task.className] = [];
    state.data.classes[task.className].push(task.id);

    state.data.materials[task.id] = (state.addPendingFiles || []).map((file) => ({
      ...file,
      uploadedAt: new Date().toISOString(),
    }));
    state.data.outputs[task.id] = {};
    state.data.chats[task.id] = [];

    persist();
    state.activeView = "dashboard";
    render();
  });
}

function renderClasses() {
  const template = document.getElementById("classes-view");
  app.innerHTML = "";
  app.appendChild(template.content.cloneNode(true));

  const grouped = groupByClass();
  const container = document.getElementById("classes-grouped");
  if (!Object.keys(grouped).length) {
    container.innerHTML = `<p class="muted">No class items yet.</p>`;
    return;
  }

  container.innerHTML = Object.entries(grouped)
    .map(
      ([className, tasks]) => `
      <article class="class-block">
        <h3>${escapeHtml(className)}</h3>
        <div class="list">
          ${tasks
            .map(
              (task) =>
                `<article class="item-row" data-task-id="${task.id}"><div><strong>${escapeHtml(task.title)}</strong><small>${
                  task.type
                } • ${formatDate(task.dueDate)} • <span class="priority ${task.priority}">${task.priority}</span></small></div><span class="tag ${
                  task.type
                }">${task.type}</span></article>`
            )
            .join("")}
        </div>
      </article>`
    )
    .join("");

  bindTaskRowClicks();
}

function renderStudyTools() {
  const template = document.getElementById("study-view");
  app.innerHTML = "";
  app.appendChild(template.content.cloneNode(true));

  const select = document.getElementById("study-select");
  const output = document.getElementById("study-output");
  const buttons = document.getElementById("study-buttons");

  if (!state.data.tasks.length) {
    select.innerHTML = `<option>No items yet</option>`;
    buttons.innerHTML = `<p class="muted">Add an item first.</p>`;
    return;
  }

  select.innerHTML = sortedByDate(state.data.tasks)
    .map((task) => `<option value="${task.id}">${escapeHtml(task.title)} (${task.type})</option>`)
    .join("");

  const initialTask = state.selectedStudyTaskId
    ? state.data.tasks.find((task) => task.id === state.selectedStudyTaskId)
    : sortedByDate(state.data.tasks)[0];

  if (initialTask) {
    state.selectedStudyTaskId = initialTask.id;
    select.value = initialTask.id;
    renderStudyButtons(initialTask);
    output.textContent = getLastOutput(initialTask.id) || "Select a generator.";
  }

  select.addEventListener("change", () => {
    const task = state.data.tasks.find((item) => item.id === select.value);
    if (!task) return;
    state.selectedStudyTaskId = task.id;
    renderStudyButtons(task);
    output.textContent = getLastOutput(task.id) || "Select a generator.";
  });

  function renderStudyButtons(task) {
    const map = {
      Exam: [
        ["studyPlan", "Generate Smart Study Plan"],
        ["summary", "Generate Summary Notes"],
        ["questions", "Generate Practice Questions"],
        ["flashcards", "Generate Flashcards"],
      ],
      Project: [
        ["phases", "Break Project Into Phases"],
        ["timeline", "Generate Work Timeline"],
        ["milestones", "Create Milestone Plan"],
        ["risks", "Identify Risks / Blockers"],
      ],
      Assignment: [
        ["steps", "Break Into Steps"],
        ["estimate", "Estimate Time"],
        ["checklist", "Create Checklist"],
        ["clarify", "Questions to Clarify"],
      ],
    };

    buttons.innerHTML = (map[task.type] || [])
      .map(([key, label]) => `<button class="btn btn-secondary" data-gen="${key}">${label}</button>`)
      .join("");

    buttons.querySelectorAll("[data-gen]").forEach((button) => {
      button.addEventListener("click", () => {
        const generated = generateForTask(task, button.dataset.gen);
        state.data.outputs[task.id][button.dataset.gen] = generated;
        task.updatedAt = new Date().toISOString();
        persist();
        output.textContent = generated;
      });
    });
  }
}

function generateForTask(task, mode) {
  const materials = (state.data.materials[task.id] || []).map((item) => item.text).join("\n");
  const textBase = `${task.notes}\n${materials}`;
  const topics = extractTopics(textBase);
  const hardTopics = topics.filter(isHardTopic).slice(0, 4);

  if (task.type === "Exam") {
    if (mode === "studyPlan") {
      const daysLeft = Math.max(1, daysUntil(task.dueDate));
      const planDays = Math.min(daysLeft, 14);
      const schedule = [];
      for (let day = 1; day <= planDays; day += 1) {
        const topic = topics[(day - 1) % Math.max(1, topics.length)] || "core chapter review";
        const mins = day <= Math.ceil(planDays * 0.4) ? 95 : day <= Math.ceil(planDays * 0.8) ? 75 : 60;
        let detail = `Day ${day}: ${topic} (${mins} min)`;
        if (day % 4 === 0) detail += " • Practice + reinforcement";
        if (day === planDays - 1) detail += " • Full review day";
        if (day === planDays) detail += " • Final review before exam";
        if (isHardTopic(topic)) detail += " • harder topic";
        schedule.push(`- ${detail}`);
      }

      return `Smart Study Plan for ${task.title}
Due in ${daysLeft} day(s)
Focus topics needing extra time: ${hardTopics.join(", ") || "Not enough data yet"}

Daily breakdown:
${schedule.join("\n")}`;
    }

    if (mode === "summary") {
      return `Summary Notes
Top themes:
${topics.slice(0, 8).map((t, i) => `${i + 1}) ${t}`).join("\n") || "Add more notes/materials."}`;
    }

    if (mode === "questions") {
      return `Practice Questions
1) Explain ${topics[0] || "a core concept"}.
2) Compare ${topics[1] || "topic A"} and ${topics[2] || "topic B"}.
3) Apply ${topics[3] || "a concept"} to a scenario.
4) Short answer: what are common mistakes in this topic?`;
    }

    return (topics.slice(0, 10).map((topic, i) => `Card ${i + 1}
Front: ${topic}?
Back: definition + one example.`).join("\n\n") ||
      "Card 1\nFront: Most important topic?\nBack: define it clearly.");
  }

  if (task.type === "Project") {
    if (mode === "phases") return `Project Phases
1) Scope + requirements
2) Research + references
3) Build first draft/prototype
4) Improve quality + revisions
5) Final polish + submission`;
    if (mode === "timeline") return `Work Timeline
- Week 1: planning + setup
- Week 2: core implementation
- Week 3: revisions + testing
- Final days: polish + submission checks`;
    if (mode === "milestones") return `Milestone Plan
☐ Draft outline complete
☐ First working version complete
☐ Feedback incorporated
☐ Final quality check complete`;
    return `Risks / Blockers
- unclear requirements
- missing resources/data
- time underestimation
- quality rushed near deadline
Mitigation: clarify early, checkpoint progress twice weekly.`;
  }

  if (mode === "steps") return `Assignment Steps
1) Understand prompt and rubric
2) Gather required sources/material
3) Draft response structure
4) Write/solve and verify
5) Proofread and submit`;
  if (mode === "estimate") return `Estimated Time
- Research/reading: 45-75 min
- Drafting/problem solving: 60-120 min
- Review and fixes: 30-45 min
Total estimated: 2.5 to 4 hours`;
  if (mode === "checklist") return `Checklist
☐ Prompt fully answered
☐ Required format followed
☐ Supporting evidence included
☐ Final review completed
☐ Submitted on time`;
  return `Questions to Clarify
1) Which rubric criteria carry most points?
2) What depth is expected?
3) Is a specific format or citation style required?
4) Are examples mandatory?`;
}

function openItemDetail(taskId) {
  const task = state.data.tasks.find((item) => item.id === taskId);
  if (!task) return;

  const files = state.data.materials[task.id] || [];
  const outputs = state.data.outputs[task.id] || {};

  modal.innerHTML = `
    <div class="modal-head">
      <h2>${escapeHtml(task.title)}</h2>
      <button id="close-modal" class="btn btn-ghost">Close</button>
    </div>
    <p class="muted">${task.type} • ${escapeHtml(task.className)} • ${formatDate(task.dueDate)} • <span class="priority ${
    task.priority
  }">${task.priority}</span></p>
    <p>${escapeHtml(task.notes || "No notes")}</p>
    <h3>Uploaded Files</h3>
    <ul class="file-list">${
      files.map((f) => `<li>${escapeHtml(f.fileName)} (${f.fileType})</li>`).join("") || "<li>No files uploaded.</li>"
    }</ul>
    <h3>Extracted Text Preview</h3>
    <p class="muted">${escapeHtml((files.map((f) => f.text).join("\n\n").slice(0, 600) || "No extracted text."))}</p>
    <h3>Generated Outputs</h3>
    <div class="output">${escapeHtml(
      Object.entries(outputs)
        .map(([key, value]) => `${key}:\n${value}`)
        .join("\n\n") || "No generated outputs yet."
    )}</div>
    <div class="action-row">
      <button id="delete-item" class="btn btn-danger">Delete Item</button>
    </div>
  `;

  modal.showModal();

  document.getElementById("close-modal").addEventListener("click", () => modal.close());
  document.getElementById("delete-item").addEventListener("click", () => {
    if (!window.confirm(`Delete ${task.title}?`)) return;
    removeTask(task.id);
    modal.close();
    render();
  });
}

function removeTask(taskId) {
  const task = state.data.tasks.find((item) => item.id === taskId);
  if (!task) return;

  state.data.tasks = state.data.tasks.filter((item) => item.id !== taskId);
  delete state.data.materials[taskId];
  delete state.data.outputs[taskId];
  delete state.data.chats[taskId];

  if (state.data.classes[task.className]) {
    state.data.classes[task.className] = state.data.classes[task.className].filter((id) => id !== taskId);
    if (!state.data.classes[task.className].length) delete state.data.classes[task.className];
  }

  persist();
}

function renderTaskRows(tasks, emptyMessage) {
  if (!tasks.length) return `<p class="muted">${emptyMessage}</p>`;

  return tasks
    .map(
      (task) => `
      <article class="item-row" data-task-id="${task.id}">
        <div>
          <strong>${escapeHtml(task.title)}</strong>
          <small>${escapeHtml(task.className)} • ${formatDate(task.dueDate)} • <span class="priority ${task.priority}">${
        task.priority
      }</span></small>
        </div>
        <span class="tag ${task.type}">${task.type}</span>
      </article>
    `
    )
    .join("");
}

function bindTaskRowClicks() {
  app.querySelectorAll("[data-task-id]").forEach((row) => {
    row.addEventListener("click", () => openItemDetail(row.dataset.taskId));
  });
}

function groupByClass() {
  const grouped = {};
  for (const task of state.data.tasks) {
    if (!grouped[task.className]) grouped[task.className] = [];
    grouped[task.className].push(task);
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }

  return grouped;
}

function allMaterials() {
  return Object.entries(state.data.materials).flatMap(([taskId, files]) => {
    const task = state.data.tasks.find((item) => item.id === taskId);
    if (!task) return [];
    return files.map((f) => ({ ...f, taskTitle: task.title, className: task.className, type: task.type }));
  });
}

function sortedByDate(items) {
  return [...items].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}

function getLastOutput(taskId) {
  const values = Object.values(state.data.outputs[taskId] || {});
  return values.length ? values[values.length - 1] : "";
}

function extractTopics(text) {
  if (!text.trim()) return [];
  const parts = text
    .split(/\n|\.|,|;/)
    .map((p) => p.trim())
    .filter((p) => p.length > 4)
    .slice(0, 30);

  const unique = [];
  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (!unique.some((item) => item.toLowerCase() === normalized)) unique.push(part);
  }
  return unique;
}

function isHardTopic(topic) {
  const signals = ["proof", "algorithm", "derivation", "analysis", "model", "equation", "theory", "framework"];
  const low = topic.toLowerCase();
  return signals.some((s) => low.includes(s)) || topic.length > 35;
}

function daysUntil(dateISO) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(`${dateISO}T00:00:00`);
  return Math.max(0, Math.ceil((due - today) / 86400000));
}

async function extractPdfText(file) {
  const bytes = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
  let text = "";

  for (let page = 1; page <= pdf.numPages; page += 1) {
    const p = await pdf.getPage(page);
    const c = await p.getTextContent();
    text += `\n[Page ${page}] ${c.items.map((item) => ("str" in item ? item.str : "")).join(" ")}`;
  }

  return text.trim();
}

function formatDate(dateISO) {
  if (!dateISO) return "No date";
  const d = new Date(`${dateISO}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function toISO(date) {
  return date.toISOString().slice(0, 10);
}

function getExt(name) {
  return name.toLowerCase().split(".").pop();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
