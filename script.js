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
  selectedToolKey: null,
};

render();

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }

  return { tasks: [], classes: {}, materials: {}, outputs: {}, analysis: {}, chats: {} };
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function render() {
  renderTopNav();
  if (state.activeView === "dashboard") return renderDashboard();
  if (state.activeView === "calendar") return renderCalendar();
  if (state.activeView === "add") return renderAdd();
  if (state.activeView === "classes") return renderClasses();
  renderStudyTools();
}

function renderTopNav() {
  const tabs = [
    ["dashboard", "Dashboard"],
    ["calendar", "Calendar"],
    ["classes", "Classes"],
    ["study", "Study Tools"],
    ["add", "+ Add New"],
  ];

  topNav.innerHTML = tabs
    .map(([key, label]) => {
      const classes = ["btn", state.activeView === key ? "tab-active" : "btn-ghost", key === "add" ? "btn-addnew" : ""].join(" ");
      return `<button class="${classes}" data-view="${key}">${label}</button>`;
    })
    .join("");

  topNav.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeView = btn.dataset.view;
      render();
    });
  });
}

function renderDashboard() {
  app.innerHTML = "";
  app.appendChild(document.getElementById("dashboard-view").content.cloneNode(true));

  const tasks = sortedByDate(state.data.tasks);
  const upcoming = tasks.filter((t) => daysUntil(t.dueDate) >= 0).slice(0, 8);
  const high = tasks.filter((t) => t.priority === "High").slice(0, 6);

  const stats = [
    ["Total Items", tasks.length],
    ["Upcoming Exams", tasks.filter((t) => t.type === "Exam" && daysUntil(t.dueDate) >= 0).length],
    ["Upcoming Projects", tasks.filter((t) => t.type === "Project" && daysUntil(t.dueDate) >= 0).length],
    ["Upcoming Assignments", tasks.filter((t) => t.type === "Assignment" && daysUntil(t.dueDate) >= 0).length],
    ["Due This Week", tasks.filter((t) => daysUntil(t.dueDate) >= 0 && daysUntil(t.dueDate) <= 7).length],
  ];

  document.getElementById("stats-grid").innerHTML = stats
    .map(([label, value]) => `<article class="card stat-card"><h4>${label}</h4><p>${value}</p></article>`)
    .join("");

  document.getElementById("upcoming-list").innerHTML = renderTaskRows(upcoming, "No upcoming deadlines yet.");
  document.getElementById("priority-list").innerHTML = renderTaskRows(high, "No high-priority items yet.");

  const recent = allMaterials().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).slice(0, 6);
  document.getElementById("recent-uploads").innerHTML = recent.length
    ? recent
        .map(
          (m) => `<article class="item-row" data-task-id="${m.taskId}"><div><strong>${escapeHtml(m.fileName)}</strong><small>${escapeHtml(
            m.taskTitle
          )} • ${escapeHtml(m.className)}</small></div><span class="tag ${m.type}">${m.type}</span></article>`
        )
        .join("")
    : `<p class="muted">Upload a PDF or TXT to populate this section.</p>`;

  app.querySelectorAll("[data-nav]").forEach((b) => {
    b.addEventListener("click", () => {
      state.activeView = b.dataset.nav;
      render();
    });
  });

  bindTaskClicks();
}

function renderCalendar() {
  app.innerHTML = "";
  app.appendChild(document.getElementById("calendar-view").content.cloneNode(true));

  const y = state.monthCursor.getFullYear();
  const m = state.monthCursor.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const first = start.getDay();

  document.getElementById("calendar-title").textContent = start.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const cells = [];
  for (let i = 0; i < first; i += 1) cells.push(calendarCell(new Date(y, m, i - first + 1), true));
  for (let day = 1; day <= end.getDate(); day += 1) cells.push(calendarCell(new Date(y, m, day), false));
  while (cells.length % 7 !== 0) cells.push(calendarCell(new Date(y, m + 1, cells.length - (first + end.getDate()) + 1), true));
  document.getElementById("calendar-grid").innerHTML = cells.join("");

  const upcoming = sortedByDate(state.data.tasks).filter((t) => daysUntil(t.dueDate) >= 0).slice(0, 12);
  document.getElementById("calendar-upcoming").innerHTML = renderTaskRows(upcoming, "No upcoming deadlines.");

  document.getElementById("prev-month").addEventListener("click", () => {
    state.monthCursor = new Date(y, m - 1, 1);
    renderCalendar();
  });
  document.getElementById("next-month").addEventListener("click", () => {
    state.monthCursor = new Date(y, m + 1, 1);
    renderCalendar();
  });

  app.querySelectorAll(".cal-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const dateTasks = state.data.tasks.filter((t) => t.dueDate === cell.dataset.date);
      if (!dateTasks.length) return;
      openDateDetails(cell.dataset.date, dateTasks);
    });
  });

  bindTaskClicks();
}

function calendarCell(date, outside) {
  const iso = toISO(date);
  const items = state.data.tasks.filter((t) => t.dueDate === iso).slice(0, 3);
  return `<article class="cal-cell ${outside ? "outside" : ""}" data-date="${iso}"><div class="cal-day">${date.getDate()}</div>${items
    .map((t) => `<div class="cal-item ${t.type}">${escapeHtml(t.title)}</div>`)
    .join("")}</article>`;
}

function renderAdd() {
  app.innerHTML = "";
  app.appendChild(document.getElementById("add-view").content.cloneNode(true));

  state.addPendingFiles = [];
  const status = document.getElementById("add-upload-status");
  const list = document.getElementById("add-upload-list");

  document.getElementById("add-files").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    status.textContent = "Reading and analyzing files...";

    for (const file of files) {
      const ext = getExt(file.name);
      if (!["txt", "pdf"].includes(ext)) continue;
      let text = "";
      let failed = false;
      if (ext === "txt") text = await file.text();
      else {
        try {
          text = await extractPdfText(file);
        } catch {
          failed = true;
          text = "(PDF extraction failed.)";
        }
      }

      state.addPendingFiles.push({ id: crypto.randomUUID(), fileName: file.name, fileType: ext, text, failed, uploadedAt: new Date().toISOString() });
    }

    status.textContent = `Prepared ${state.addPendingFiles.length} file(s).`;
    list.innerHTML = state.addPendingFiles.map((f) => `<li>${escapeHtml(f.fileName)} ${f.failed ? "(limited extraction)" : ""}</li>`).join("");
  });

  document.getElementById("reset-add").addEventListener("click", () => renderAdd());

  document.getElementById("add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.target));

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

    state.data.materials[task.id] = [...state.addPendingFiles];
    state.data.analysis[task.id] = analyzeStudyMaterial(`${task.notes}\n${state.addPendingFiles.map((f) => f.text).join("\n")}`);
    state.data.outputs[task.id] = autoGenerateOutputs(task, state.data.analysis[task.id]);
    state.data.chats[task.id] = [];

    persist();
    state.activeView = "dashboard";
    render();
  });
}

function analyzeStudyMaterial(text) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return { topics: [], keywords: [], sections: [], difficulty: "Low", complexityScore: 0 };

  const sections = cleaned
    .split(/(?:\n\n+|\.|:)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 16)
    .slice(0, 14);

  const tokens = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !COMMON_WORDS.has(w));

  const counts = new Map();
  tokens.forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
  const keywords = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w]) => w);

  const topicMap = new Map();
  sections.forEach((section) => {
    const name = toTopicName(section, keywords);
    topicMap.set(name, (topicMap.get(name) || 0) + 1);
  });

  const total = [...topicMap.values()].reduce((a, b) => a + b, 0) || 1;
  const topics = [...topicMap.entries()]
    .map(([name, count]) => ({ name, weight: Number((count / total).toFixed(2)) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  const score = Math.min(1, (tokens.length / 850) * 0.45 + (topics.length / 10) * 0.3 + (keywords.length / 15) * 0.25);
  const difficulty = score > 0.72 ? "High" : score > 0.42 ? "Medium" : "Low";

  return { topics, keywords, sections, difficulty, complexityScore: Number(score.toFixed(2)) };
}

function autoGenerateOutputs(task, analysis) {
  if (task.type === "Exam") {
    return {
      studyPlan: generateExamStudyPlan(task, analysis),
      summary: generateExamSummary(task, analysis),
      checklist: generateExamChecklist(task, analysis),
    };
  }
  if (task.type === "Project") {
    return {
      studyPlan: generateProjectTimeline(task, analysis),
      summary: generateProjectSummary(task, analysis),
      checklist: "☐ Research\n☐ Outline\n☐ Execution\n☐ Polish",
    };
  }
  return {
    studyPlan: generateAssignmentPlan(task, analysis),
    summary: generateAssignmentSummary(task, analysis),
    checklist: "☐ Understand task\n☐ Gather info\n☐ Complete work\n☐ Review",
  };
}

function renderClasses() {
  app.innerHTML = "";
  app.appendChild(document.getElementById("classes-view").content.cloneNode(true));

  const grouped = groupByClass();
  const root = document.getElementById("classes-grouped");
  if (!Object.keys(grouped).length) {
    root.innerHTML = `<p class="muted">No class items yet. Add one with + Add New.</p>`;
    return;
  }

  root.innerHTML = Object.entries(grouped)
    .map(
      ([className, tasks]) => `<article class="class-block"><h3>${escapeHtml(className)}</h3><div class="list">${tasks
        .map(
          (task) => `<article class="item-row" data-task-id="${task.id}"><div><strong>${escapeHtml(task.title)}</strong><small>${
            task.type
          } • ${formatDate(task.dueDate)} • <span class="priority ${task.priority}">${task.priority}</span></small></div><span class="tag ${
            task.type
          }">${task.type}</span></article>`
        )
        .join("")}</div></article>`
    )
    .join("");

  bindTaskClicks();
}

function renderStudyTools() {
  app.innerHTML = "";
  app.appendChild(document.getElementById("study-view").content.cloneNode(true));

  const select = document.getElementById("study-select");
  const buttons = document.getElementById("study-buttons");
  const output = document.getElementById("study-output");
  const empty = document.getElementById("study-empty");

  if (!state.data.tasks.length) {
    select.innerHTML = `<option>No items yet</option>`;
    buttons.innerHTML = "";
    output.innerHTML = "";
    empty.textContent = "Select an item to begin. Add an item first if none exist.";
    return;
  }

  empty.textContent = "";
  const tasks = sortedByDate(state.data.tasks);
  select.innerHTML = tasks.map((t) => `<option value="${t.id}">${escapeHtml(t.title)} (${t.type})</option>`).join("");

  const selectedTask = state.selectedStudyTaskId ? tasks.find((t) => t.id === state.selectedStudyTaskId) : tasks[0];
  state.selectedStudyTaskId = selectedTask.id;
  select.value = selectedTask.id;
  drawButtons(selectedTask);

  select.addEventListener("change", () => {
    const task = tasks.find((t) => t.id === select.value);
    if (!task) return;
    state.selectedStudyTaskId = task.id;
    state.selectedToolKey = null;
    drawButtons(task);
  });

  function drawButtons(task) {
    const map = {
      Exam: [
        ["studyPlan", "Daily Study Plan"],
        ["summary", "Summary Notes"],
        ["questions", "Practice Questions"],
        ["flashcards", "Flashcards"],
      ],
      Project: [
        ["studyPlan", "Work Timeline"],
        ["summary", "Milestone Notes"],
        ["questions", "Risks / Blockers"],
        ["flashcards", "Phase Cards"],
      ],
      Assignment: [
        ["studyPlan", "Step Breakdown"],
        ["summary", "Time Estimate"],
        ["questions", "Checklist"],
        ["flashcards", "Clarify Questions"],
      ],
    };

    const buttonsList = map[task.type] || [];
    if (!state.selectedToolKey) state.selectedToolKey = buttonsList[0][0];

    buttons.innerHTML = buttonsList
      .map(([key, label]) => `<button class="btn btn-secondary ${state.selectedToolKey === key ? "tool-btn-active" : ""}" data-tool="${key}">${label}</button>`)
      .join("");

    renderToolOutput(task, state.selectedToolKey);

    buttons.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedToolKey = btn.dataset.tool;
        drawButtons(task);
      });
    });
  }

  function renderToolOutput(task, key) {
    const analysis = state.data.analysis[task.id] || analyzeStudyMaterial(task.notes || "");
    let text = state.data.outputs[task.id]?.[key] || "";

    if (!text) {
      if (task.type === "Exam") text = generateExamOutputByKey(task, analysis, key);
      else if (task.type === "Project") text = generateProjectOutputByKey(task, analysis, key);
      else text = generateAssignmentOutputByKey(task, analysis, key);
      state.data.outputs[task.id][key] = text;
      persist();
    }

    output.innerHTML = renderStructuredOutput(task.type, key, text);
  }
}

function generateExamOutputByKey(task, analysis, key) {
  if (key === "studyPlan") return generateExamStudyPlan(task, analysis);
  if (key === "summary") return generateExamSummary(task, analysis);
  if (key === "questions") return generateExamQuestions(task, analysis);
  return generateExamFlashcards(task, analysis);
}

function generateProjectOutputByKey(task, analysis, key) {
  if (key === "studyPlan") return generateProjectTimeline(task, analysis);
  if (key === "summary") return generateProjectSummary(task, analysis);
  if (key === "questions") return "- unclear scope\n- missing data\n- timeline crunch\n- quality risk";
  return "Card 1: Research\nCard 2: Outline\nCard 3: Execution\nCard 4: Polish";
}

function generateAssignmentOutputByKey(task, analysis, key) {
  if (key === "studyPlan") return generateAssignmentPlan(task, analysis);
  if (key === "summary") return "Estimated Time\n- research: 45-60 min\n- execution: 60-120 min\n- review: 30 min";
  if (key === "questions") return "☐ Understand task\n☐ Gather info\n☐ Complete work\n☐ Review and submit";
  return "1) Which format is required?\n2) What depth is expected?\n3) Is citation style required?";
}

function generateExamStudyPlan(task, analysis) {
  const days = Math.max(1, daysUntil(task.dueDate));
  const pool = analysis.topics.length ? analysis.topics : [{ name: "Core Topics", weight: 1 }];
  const cap = Math.min(days, 14);
  const lines = [];
  for (let d = 1; d <= cap; d += 1) {
    const a = pool[(d - 1) % pool.length];
    const b = pool[d % pool.length];
    const h1 = Number((0.9 + a.weight * 2).toFixed(1));
    const h2 = Number((0.7 + b.weight * 1.6).toFixed(1));
    let line = `Day ${d}: ${a.name} (${h1} hrs), ${b.name} (${h2} hrs)`;
    if (d % 3 === 0) line += " • review block";
    if (d === cap - 1) line += " • practice exam";
    if (d === cap) line += " • final review";
    lines.push(`- ${line}`);
  }
  return `Smart Study Plan\nDays remaining: ${days}\nDifficulty: ${analysis.difficulty}\n${lines.join("\n")}`;
}

function generateExamSummary(task, analysis) {
  return `Summary Notes\nTop topics:\n${analysis.topics.slice(0, 8).map((t, i) => `${i + 1}) ${t.name} (weight ${t.weight})`).join("\n") || "No parsed topics yet."}\n\nKeywords: ${analysis.keywords.slice(0, 12).join(", ") || "none"}`;
}

function generateExamQuestions(task, analysis) {
  const topics = analysis.topics.map((t) => t.name);
  return `1) Explain ${topics[0] || "the core concept"}.\n2) Compare ${topics[1] || "topic A"} and ${topics[2] || "topic B"}.\n3) Apply ${topics[3] || "a method"} to a scenario.`;
}

function generateExamFlashcards(task, analysis) {
  return (analysis.topics.slice(0, 8).map((t, i) => `Card ${i + 1}: ${t.name}`).join("\n") || "Card 1: Main concept");
}

function generateProjectTimeline(task, analysis) {
  const days = Math.max(1, daysUntil(task.dueDate));
  return `Project Timeline (${days} days)\n- Research: ${Math.max(1, Math.floor(days * 0.2))}d\n- Outline: ${Math.max(1, Math.floor(days * 0.15))}d\n- Execution: ${Math.max(1, Math.floor(days * 0.45))}d\n- Polish: ${Math.max(1, Math.floor(days * 0.2))}d`;
}

function generateProjectSummary(task, analysis) {
  return `Milestone Notes\nFocus: ${analysis.topics.slice(0, 5).map((t) => t.name).join(", ") || "scope, execution, polish"}`;
}

function generateAssignmentPlan(task, analysis) {
  const days = Math.max(1, daysUntil(task.dueDate));
  return `Step Breakdown (${days} days)\n1) Understand task\n2) Gather info\n3) Complete work\n4) Review`;
}

function generateAssignmentSummary(task, analysis) {
  return `Time Estimate\n- Understand: 30m\n- Research: 45-60m\n- Complete: 60-120m\n- Review: 30m`;
}

function generateExamChecklist(task, analysis) {
  return `☐ Complete daily blocks\n☐ Finish review blocks\n☐ Practice exam\n☐ Final review`;
}

function renderStructuredOutput(type, key, text) {
  const lines = text.split("\n").filter(Boolean);
  const listItems = lines.filter((l) => l.startsWith("-") || l.startsWith("☐") || /^\d+\)/.test(l));
  const top = lines.filter((l) => !listItems.includes(l)).slice(0, 4);

  return `<div class="panel"><h4>${escapeHtml(titleForOutput(type, key))}</h4>${top.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}${
    listItems.length ? `<ul>${listItems.map((l) => `<li>${escapeHtml(l.replace(/^-\s*/, ""))}</li>`).join("")}</ul>` : ""
  }</div><pre>${escapeHtml(text)}</pre>`;
}

function titleForOutput(type, key) {
  const map = {
    studyPlan: type === "Exam" ? "Daily Study Plan" : type === "Project" ? "Work Timeline" : "Step Breakdown",
    summary: type === "Exam" ? "Summary Notes" : type === "Project" ? "Milestone Notes" : "Time Estimate",
    questions: type === "Exam" ? "Practice Questions" : type === "Project" ? "Risks / Blockers" : "Checklist",
    flashcards: type === "Exam" ? "Flashcards" : type === "Project" ? "Phase Cards" : "Clarify Questions",
  };
  return map[key] || "Output";
}

function openItemDetail(taskId) {
  const task = state.data.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const files = state.data.materials[taskId] || [];
  const outputs = state.data.outputs[taskId] || {};
  const analysis = state.data.analysis[taskId] || { topics: [], difficulty: "Low" };

  modal.innerHTML = `<div class="modal-head"><h2>${escapeHtml(task.title)}</h2><button id="close-modal" class="btn btn-ghost">Close</button></div>
  <p class="muted">${task.type} • ${escapeHtml(task.className)} • ${formatDate(task.dueDate)} • <span class="priority ${task.priority}">${task.priority}</span></p>
  <p>${escapeHtml(task.notes || "No notes")}</p>
  <h3>Uploaded Files</h3><ul class="file-list">${files.map((f) => `<li>${escapeHtml(f.fileName)} (${f.fileType})</li>`).join("") || "<li>No files uploaded.</li>"}</ul>
  <h3>Extracted Material Summary</h3><p class="muted">Difficulty: ${analysis.difficulty} • Topics: ${(analysis.topics || []).map((t) => t.name).join(", ") || "none"}</p>
  <h3>Generated Outputs</h3><div class="output">${escapeHtml(Object.entries(outputs).map(([k, v]) => `${k}:\n${v}`).join("\n\n") || "No outputs yet.")}</div>
  <div class="action-row"><button id="delete-item" class="btn btn-danger">Delete Item</button></div>`;

  modal.showModal();
  document.getElementById("close-modal").addEventListener("click", () => modal.close());
  document.getElementById("delete-item").addEventListener("click", () => {
    if (!window.confirm(`Delete ${task.title}?`)) return;
    removeTask(task.id);
    modal.close();
    render();
  });
}

function openDateDetails(date, tasks) {
  modal.innerHTML = `<div class="modal-head"><h2>${formatDate(date)}</h2><button id="close-modal" class="btn btn-ghost">Close</button></div>
  <p class="muted">Tasks on this day</p>
  <div class="list">${tasks
    .map((t) => `<article class="item-row" data-modal-task="${t.id}"><div><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(
      t.className
    )} • ${t.type}</small></div><span class="tag ${t.type}">${t.type}</span></article>`)
    .join("")}</div>`;
  modal.showModal();
  document.getElementById("close-modal").addEventListener("click", () => modal.close());
  modal.querySelectorAll("[data-modal-task]").forEach((row) => {
    row.addEventListener("click", () => openItemDetail(row.dataset.modalTask));
  });
}

function removeTask(taskId) {
  const task = state.data.tasks.find((t) => t.id === taskId);
  if (!task) return;
  state.data.tasks = state.data.tasks.filter((t) => t.id !== taskId);
  delete state.data.materials[taskId];
  delete state.data.outputs[taskId];
  delete state.data.analysis[taskId];
  delete state.data.chats[taskId];
  if (state.data.classes[task.className]) {
    state.data.classes[task.className] = state.data.classes[task.className].filter((id) => id !== taskId);
    if (!state.data.classes[task.className].length) delete state.data.classes[task.className];
  }
  persist();
}

function renderTaskRows(tasks, empty) {
  if (!tasks.length) return `<p class="muted">${empty}</p>`;
  return tasks
    .map(
      (t) => `<article class="item-row" data-task-id="${t.id}"><div><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(
        t.className
      )} • ${formatDate(t.dueDate)} • <span class="priority ${t.priority}">${t.priority}</span></small></div><span class="tag ${t.type}">${
        t.type
      }</span></article>`
    )
    .join("");
}

function bindTaskClicks() {
  app.querySelectorAll("[data-task-id]").forEach((el) => el.addEventListener("click", () => openItemDetail(el.dataset.taskId)));
}

function groupByClass() {
  const grouped = {};
  for (const task of state.data.tasks) {
    if (!grouped[task.className]) grouped[task.className] = [];
    grouped[task.className].push(task);
  }
  Object.keys(grouped).forEach((k) => grouped[k].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)));
  return grouped;
}

function allMaterials() {
  return Object.entries(state.data.materials).flatMap(([taskId, files]) => {
    const task = state.data.tasks.find((t) => t.id === taskId);
    if (!task) return [];
    return files.map((f) => ({ ...f, taskId, taskTitle: task.title, className: task.className, type: task.type }));
  });
}

function sortedByDate(items) {
  return [...items].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}

function getLastOutput(taskId) {
  const values = Object.values(state.data.outputs[taskId] || {});
  return values.length ? values[values.length - 1] : "";
}

function toTopicName(section, keywords) {
  const tokens = section
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !COMMON_WORDS.has(w));
  const ranked = tokens.filter((t) => keywords.includes(t)).slice(0, 3).join(" ");
  return (ranked || section.slice(0, 32)).replace(/\b\w/g, (c) => c.toUpperCase());
}

async function extractPdfText(file) {
  const bytes = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
  let text = "";
  for (let page = 1; page <= pdf.numPages; page += 1) {
    const p = await pdf.getPage(page);
    const c = await p.getTextContent();
    text += `\n[Page ${page}] ${c.items.map((i) => ("str" in i ? i.str : "")).join(" ")}`;
  }
  return text.trim();
}

function daysUntil(dateISO) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.ceil((new Date(`${dateISO}T00:00:00`) - today) / 86400000));
}

function formatDate(dateISO) {
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

const COMMON_WORDS = new Set([
  "about",
  "after",
  "again",
  "below",
  "could",
  "every",
  "first",
  "their",
  "there",
  "these",
  "which",
  "while",
  "where",
  "would",
  "should",
  "because",
  "through",
  "between",
  "without",
  "assignment",
  "project",
  "chapter",
  "section",
  "lecture",
]);
