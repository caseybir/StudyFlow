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
  return { tasks: [], classes: {}, materials: {}, outputs: {}, analysis: {}, plans: {}, calendarEvents: [], chats: {} };
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
      const className = ["btn", state.activeView === key ? "tab-active" : "btn-ghost", key === "add" ? "btn-addnew" : ""].join(" ");
      return `<button class="${className}" data-view="${key}">${label}</button>`;
    })
    .join("");

  topNav.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    state.activeView = b.dataset.view;
    render();
  }));
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
    ["Due This Week", tasks.filter((t) => daysUntil(t.dueDate) <= 7 && daysUntil(t.dueDate) >= 0).length],
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
          )} • ${escapeHtml(m.className)}</small></div><span class="chevron">›</span></article>`
        )
        .join("")
    : `<p class="muted">Upload a PDF or TXT to populate this section.</p>`;

  app.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => {
    state.activeView = b.dataset.nav;
    render();
  }));

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

  const upcomingEvents = sortedByDate(getAllCalendarEvents()).filter((e) => daysUntil(e.date) >= 0).slice(0, 12);
  document.getElementById("calendar-upcoming").innerHTML = renderEventRows(upcomingEvents, "No upcoming events.");
  document.getElementById("day-events").innerHTML = `<p class="muted">Click a day to see all events.</p>`;

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
      const dayEvents = getAllCalendarEvents().filter((e) => e.date === cell.dataset.date);
      document.getElementById("day-events").innerHTML = renderEventRows(dayEvents, "No events for this day.");
      bindEventClicks();
    });
  });

  bindEventClicks();
}

function calendarCell(date, outside) {
  const iso = toISO(date);
  const events = getAllCalendarEvents().filter((e) => e.date === iso).slice(0, 3);
  return `<article class="cal-cell ${outside ? "outside" : ""}" data-date="${iso}"><div class="cal-day">${date.getDate()}</div>${events
    .map((e) => `<div class="cal-item ${e.colorClass}">${escapeHtml(e.title)}</div>`)
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
    const analysis = analyzeStudyMaterial(`${task.notes}\n${state.addPendingFiles.map((f) => f.text).join("\n")}`);
    state.data.analysis[task.id] = analysis;

    const plan = buildStructuredPlan(task, analysis);
    state.data.plans[task.id] = plan;
    state.data.outputs[task.id] = autoGenerateOutputs(task, analysis, plan);

    updateCalendarEventsForTask(task.id);
    state.data.chats[task.id] = [];
    persist();

    state.activeView = "dashboard";
    render();
  });
}

function buildStructuredPlan(task, analysis) {
  if (task.type === "Project") return buildProjectPlan(task, analysis);
  if (task.type === "Assignment") return buildAssignmentPlan(task, analysis);
  return buildExamPlan(task, analysis);
}

function buildProjectPlan(task, analysis) {
  const due = new Date(`${task.dueDate}T00:00:00`);
  const baseDays = Math.max(5, Math.ceil((analysis.topics.length + 4) * (analysis.difficulty === "High" ? 1.4 : 1.1)));
  const start = addDays(due, -baseDays - 1);
  const phases = [
    ["Understand requirements + gather materials", 0.2, "1.5 hrs"],
    ["Outline and research", 0.2, "2 hrs"],
    ["Build draft / implementation", 0.4, "4 hrs"],
    ["Revise and polish", 0.15, "1.5 hrs"],
    ["Final submission check", 0.05, "30 min"],
  ];
  return makePhasedPlan(start, due, phases, "Project");
}

function buildAssignmentPlan(task, analysis) {
  const due = new Date(`${task.dueDate}T00:00:00`);
  const baseDays = Math.max(3, Math.ceil((analysis.topics.length + 3) * (analysis.difficulty === "High" ? 1.2 : 0.9)));
  const start = addDays(due, -baseDays - 1);
  const phases = [
    ["Understand task", 0.2, "30 min"],
    ["Gather info", 0.25, "45-60 min"],
    ["Complete work", 0.4, "60-120 min"],
    ["Review before due date", 0.15, "30 min"],
  ];
  return makePhasedPlan(start, due, phases, "Assignment");
}

function buildExamPlan(task, analysis) {
  const due = new Date(`${task.dueDate}T00:00:00`);
  const topics = analysis.topics.length ? analysis.topics : [{ name: "Core Topics", weight: 1 }];
  const studyDays = Math.max(4, Math.ceil(topics.length * (analysis.difficulty === "High" ? 1.5 : 1.1)));
  const start = addDays(due, -studyDays - 1);

  const steps = [];
  for (let i = 0; i < studyDays; i += 1) {
    const date = addDays(start, i);
    const t1 = topics[i % topics.length];
    const t2 = topics[(i + 1) % topics.length];
    const d1 = `${Number((1 + t1.weight * 2).toFixed(1))} hrs`;
    const d2 = `${Number((0.8 + t2.weight * 1.6).toFixed(1))} hrs`;
    let title = `${t1.name} + ${t2.name}`;
    let desc = `Study ${t1.name} (${d1}) and ${t2.name} (${d2}).`;
    if ((i + 1) % 3 === 0) {
      title = `Review Block: ${t1.name}`;
      desc = `Spaced repetition + practice questions for ${t1.name}.`;
    }

    steps.push({ title, date: toISO(date), duration: `${d1} + ${d2}`, description: desc });
  }

  steps.push({
    title: "Final Review Day",
    date: toISO(addDays(due, -1)),
    duration: "1.5 hrs",
    description: "Final recap, weak topic sweep, and confidence pass.",
  });

  return { startDate: toISO(start), steps, planType: "Exam" };
}

function makePhasedPlan(start, due, phases, type) {
  const totalDays = Math.max(1, Math.ceil((due - start) / 86400000));
  let cursor = new Date(start);
  const steps = [];

  phases.forEach(([title, ratio, duration], idx) => {
    const span = idx === phases.length - 1 ? 1 : Math.max(1, Math.floor(totalDays * ratio));
    const phaseStart = new Date(cursor);
    const phaseEnd = addDays(phaseStart, span - 1);
    steps.push({
      title,
      date: toISO(phaseStart),
      endDate: toISO(phaseEnd),
      duration,
      description: `${type} phase from ${formatDate(toISO(phaseStart))} to ${formatDate(toISO(phaseEnd))}.`,
    });
    cursor = addDays(phaseEnd, 1);
  });

  return { startDate: toISO(start), steps, planType: type };
}

function autoGenerateOutputs(task, analysis, plan) {
  if (task.type === "Exam") {
    return {
      studyPlan: formatPlanText(plan),
      summary: generateExamSummary(analysis),
      checklist: "☐ Daily study blocks\n☐ Review blocks\n☐ Practice exam\n☐ Final review",
      questions: generateExamQuestions(analysis),
      flashcards: generateExamFlashcards(analysis),
    };
  }

  if (task.type === "Project") {
    return {
      studyPlan: formatPlanText(plan),
      summary: `Milestone Notes\nFocus: ${(analysis.topics || []).slice(0, 5).map((t) => t.name).join(", ") || "scope, execution, polish"}`,
      checklist: "☐ Research\n☐ Outline\n☐ Execution\n☐ Polish",
      questions: "- unclear scope\n- resource gaps\n- timeline risk\n- quality risk",
      flashcards: "Card 1: Research\nCard 2: Outline\nCard 3: Execution\nCard 4: Polish",
    };
  }

  return {
    studyPlan: formatPlanText(plan),
    summary: "Time Estimate\n- Understand: 30m\n- Gather info: 45-60m\n- Complete: 60-120m\n- Review: 30m",
    checklist: "☐ Understand task\n☐ Gather info\n☐ Complete work\n☐ Review",
    questions: "1) Required format?\n2) Depth expected?\n3) Citation style?",
    flashcards: "Card 1: Understand\nCard 2: Gather\nCard 3: Complete\nCard 4: Review",
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
      ([name, tasks]) => `<article class="class-block"><h3>${escapeHtml(name)}</h3><div class="list">${tasks
        .map(
          (t) => `<article class="item-row" data-task-id="${t.id}"><div><strong>${escapeHtml(t.title)}</strong><small>${t.type} • ${formatDate(
            t.dueDate
          )} • <span class="priority ${t.priority}">${t.priority}</span></small></div><span class="chevron">›</span></article>`
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
    empty.textContent = "Select an item to begin. Add an item first if none exist.";
    return;
  }

  const tasks = sortedByDate(state.data.tasks);
  select.innerHTML = tasks.map((t) => `<option value="${t.id}">${escapeHtml(t.title)} (${t.type})</option>`).join("");

  const selected = state.selectedStudyTaskId ? tasks.find((t) => t.id === state.selectedStudyTaskId) : tasks[0];
  state.selectedStudyTaskId = selected.id;
  select.value = selected.id;
  empty.textContent = "";
  draw(selected);

  select.addEventListener("change", () => {
    const task = tasks.find((t) => t.id === select.value);
    if (!task) return;
    state.selectedStudyTaskId = task.id;
    state.selectedToolKey = null;
    draw(task);
  });

  function draw(task) {
    const map = {
      Exam: [["studyPlan", "Daily Study Plan"], ["summary", "Summary Notes"], ["questions", "Practice Questions"], ["flashcards", "Flashcards"]],
      Project: [["studyPlan", "Work Timeline"], ["summary", "Milestone Notes"], ["questions", "Risks / Blockers"], ["flashcards", "Phase Cards"]],
      Assignment: [["studyPlan", "Step Breakdown"], ["summary", "Time Estimate"], ["questions", "Checklist"], ["flashcards", "Clarify Questions"]],
    };

    const set = map[task.type] || [];
    if (!state.selectedToolKey) state.selectedToolKey = set[0][0];

    buttons.innerHTML = set
      .map(([k, label]) => `<button class="btn btn-secondary ${state.selectedToolKey === k ? "tool-btn-active" : ""}" data-tool="${k}">${label}</button>`)
      .join("");

    renderOutput(task, state.selectedToolKey);

    buttons.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedToolKey = btn.dataset.tool;
        draw(task);
      });
    });
  }

  function renderOutput(task, key) {
    const text = state.data.outputs[task.id]?.[key] || "No generated output yet.";
    output.innerHTML = renderStructuredOutput(task, key, text);
  }
}

function renderStructuredOutput(task, key, text) {
  const lines = text.split("\n").filter(Boolean);
  const bullets = lines.filter((l) => l.startsWith("-") || l.startsWith("☐") || /^\d+[).]/.test(l));
  const intro = lines.filter((l) => !bullets.includes(l)).slice(0, 4);
  return `<div class="panel"><h4>${escapeHtml(titleForOutput(task.type, key))}</h4>${intro.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}${
    bullets.length ? `<ul>${bullets.map((l) => `<li>${escapeHtml(l.replace(/^-\s*/, ""))}</li>`).join("")}</ul>` : ""
  }</div><pre>${escapeHtml(text)}</pre>`;
}

function titleForOutput(type, key) {
  const map = {
    studyPlan: type === "Exam" ? "Daily Study Plan" : type === "Project" ? "Work Timeline" : "Step Breakdown",
    summary: type === "Exam" ? "Summary Notes" : type === "Project" ? "Milestone Notes" : "Time Estimate",
    questions: type === "Exam" ? "Practice Questions" : type === "Project" ? "Risks / Blockers" : "Checklist",
    flashcards: type === "Exam" ? "Flashcards" : type === "Project" ? "Phase Cards" : "Clarify Questions",
  };
  return map[key] || "Generated Output";
}

function openItemDetail(taskId) {
  const task = state.data.tasks.find((t) => t.id === taskId);
  if (!task) return;

  const files = state.data.materials[taskId] || [];
  const outputs = state.data.outputs[taskId] || {};
  const plan = state.data.plans[taskId] || { steps: [] };
  const analysis = state.data.analysis[taskId] || { topics: [], difficulty: "Low" };

  modal.innerHTML = `<div class="modal-head"><h2>${escapeHtml(task.title)}</h2><div class="action-row"><button id="edit-item" class="btn btn-ghost">Edit</button><button id="close-modal" class="btn btn-ghost">Close</button></div></div>
    <div class="modal-tabs">
      <button class="btn btn-secondary tool-btn-active" data-tab="overview">Overview</button>
      <button class="btn btn-secondary" data-tab="timeline">Timeline</button>
      <button class="btn btn-secondary" data-tab="materials">Materials</button>
      <button class="btn btn-secondary" data-tab="generated">Generated Plan</button>
    </div>
    <div id="modal-content" class="modal-content"></div>
    <div class="action-row" style="margin-top:0.7rem;"><button id="delete-item" class="btn btn-danger">Delete Item</button></div>`;

  modal.showModal();
  renderModalTab("overview");

  modal.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      modal.querySelectorAll("[data-tab]").forEach((b) => b.classList.remove("tool-btn-active"));
      btn.classList.add("tool-btn-active");
      renderModalTab(btn.dataset.tab);
    });
  });

  document.getElementById("close-modal").addEventListener("click", () => modal.close());
  document.getElementById("delete-item").addEventListener("click", () => {
    if (!window.confirm(`Delete ${task.title}?`)) return;
    removeTask(task.id);
    modal.close();
    render();
  });

  document.getElementById("edit-item").addEventListener("click", () => {
    const newNotes = prompt("Edit notes:", task.notes || "");
    if (newNotes === null) return;
    task.notes = newNotes.trim();
    const analysisUpdated = analyzeStudyMaterial(`${task.notes}\n${files.map((f) => f.text).join("\n")}`);
    state.data.analysis[task.id] = analysisUpdated;
    state.data.plans[task.id] = buildStructuredPlan(task, analysisUpdated);
    state.data.outputs[task.id] = autoGenerateOutputs(task, analysisUpdated, state.data.plans[task.id]);
    updateCalendarEventsForTask(task.id);
    persist();
    renderModalTab("overview");
    render();
  });

  function renderModalTab(tab) {
    const root = document.getElementById("modal-content");

    if (tab === "overview") {
      root.innerHTML = `<p><strong>Type:</strong> ${task.type}</p><p><strong>Class:</strong> ${escapeHtml(task.className)}</p><p><strong>Due Date:</strong> ${formatDate(
        task.dueDate
      )}</p><p><strong>Priority:</strong> <span class="priority ${task.priority}">${task.priority}</span></p><p><strong>Notes:</strong> ${escapeHtml(
        task.notes || "No notes"
      )}</p>`;
      return;
    }

    if (tab === "timeline") {
      root.innerHTML = plan.steps.length
        ? `<ul>${plan.steps
            .map(
              (s) => `<li><strong>${escapeHtml(s.title)}</strong> — ${formatDate(s.date)}${s.endDate ? ` to ${formatDate(s.endDate)}` : ""} (${escapeHtml(
                s.duration
              )})<br/><span class="muted">${escapeHtml(s.description || "")}</span></li>`
            )
            .join("")}</ul>`
        : `<p class="muted">No timeline generated yet.</p>`;
      return;
    }

    if (tab === "materials") {
      root.innerHTML = `<p><strong>Files:</strong></p><ul class="file-list">${
        files.map((f) => `<li>${escapeHtml(f.fileName)} (${f.fileType})</li>`).join("") || "<li>No files uploaded.</li>"
      }</ul><p class="muted">Extracted summary: ${escapeHtml((files.map((f) => f.text).join(" ").slice(0, 420) || "No extracted text."))}</p><p class="muted">Difficulty: ${analysis.difficulty}. Topics: ${(analysis.topics || [])
        .map((t) => t.name)
        .join(", ") || "none"}</p>`;
      return;
    }

    root.innerHTML = `<div class="output">${escapeHtml(
      Object.entries(outputs)
        .map(([k, v]) => `${k}:\n${v}`)
        .join("\n\n") || "No generated outputs yet."
    )}</div>`;
  }
}

function openDateEventList(date) {
  const events = getAllCalendarEvents().filter((e) => e.date === date);
  if (!events.length) return;
  modal.innerHTML = `<div class="modal-head"><h2>${formatDate(date)}</h2><button id="close-modal" class="btn btn-ghost">Close</button></div>
  <div class="list">${events
    .map(
      (e) => `<article class="item-row" data-task-id="${e.taskId}"><div><strong>${escapeHtml(e.title)}</strong><small>${escapeHtml(
        e.label
      )}</small></div><span class="tag ${e.colorClass}">${e.colorClass}</span></article>`
    )
    .join("")}</div>`;
  modal.showModal();
  document.getElementById("close-modal").addEventListener("click", () => modal.close());
  modal.querySelectorAll("[data-task-id]").forEach((row) => row.addEventListener("click", () => openItemDetail(row.dataset.taskId)));
}

function removeTask(taskId) {
  const task = state.data.tasks.find((t) => t.id === taskId);
  if (!task) return;
  state.data.tasks = state.data.tasks.filter((t) => t.id !== taskId);
  delete state.data.materials[taskId];
  delete state.data.outputs[taskId];
  delete state.data.analysis[taskId];
  delete state.data.plans[taskId];
  state.data.calendarEvents = state.data.calendarEvents.filter((e) => e.taskId !== taskId);
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
      )} • ${formatDate(t.dueDate)} • <span class="priority ${t.priority}">${t.priority}</span></small></div><span class="chevron">›</span></article>`
    )
    .join("");
}

function renderEventRows(events, empty) {
  if (!events.length) return `<p class="muted">${empty}</p>`;
  return events
    .map(
      (e) => `<article class="item-row" data-event-task="${e.taskId}"><div><strong>${escapeHtml(e.title)}</strong><small>${formatDate(
        e.date
      )} • ${escapeHtml(e.label)}</small></div><span class="tag ${e.colorClass}">${e.colorClass === "session" ? "Session" : e.colorClass}</span></article>`
    )
    .join("");
}

function bindTaskClicks() {
  app.querySelectorAll("[data-task-id]").forEach((el) => el.addEventListener("click", () => openItemDetail(el.dataset.taskId)));
}

function bindEventClicks() {
  app.querySelectorAll("[data-event-task]").forEach((el) => el.addEventListener("click", () => openItemDetail(el.dataset.eventTask)));
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

function getAllCalendarEvents() {
  const dueEvents = state.data.tasks.map((t) => ({ taskId: t.id, title: t.title, date: t.dueDate, label: `${t.type} due`, colorClass: t.type }));
  return [...dueEvents, ...(state.data.calendarEvents || [])];
}

function updateCalendarEventsForTask(taskId) {
  state.data.calendarEvents = (state.data.calendarEvents || []).filter((e) => e.taskId !== taskId);
  const task = state.data.tasks.find((t) => t.id === taskId);
  const plan = state.data.plans[taskId];
  if (!task || !plan?.steps?.length) return;

  plan.steps.forEach((step) => {
    state.data.calendarEvents.push({
      taskId,
      title: step.title,
      date: step.date,
      label: `${task.type} session`,
      colorClass: "session",
    });
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

function formatPlanText(plan) {
  return `Start Date: ${formatDate(plan.startDate)}\n${plan.steps
    .map((s) => `${s.title}: ${formatDate(s.date)}${s.endDate ? `–${formatDate(s.endDate)}` : ""} (${s.duration})\n${s.description}`)
    .join("\n\n")}`;
}

function generateExamSummary(analysis) {
  return `Top topics:\n${analysis.topics.slice(0, 8).map((t, i) => `${i + 1}) ${t.name} (weight ${t.weight})`).join("\n") || "No topics yet."}`;
}

function generateExamQuestions(analysis) {
  const topics = analysis.topics.map((t) => t.name);
  return `1) Explain ${topics[0] || "a core concept"}.\n2) Compare ${topics[1] || "topic A"} and ${topics[2] || "topic B"}.\n3) Apply ${topics[3] || "a concept"}.`;
}

function generateExamFlashcards(analysis) {
  return (analysis.topics.slice(0, 8).map((t, i) => `Card ${i + 1}: ${t.name}`).join("\n") || "Card 1: Main concept");
}

function sortedByDate(items) {
  return [...items].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
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

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
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
