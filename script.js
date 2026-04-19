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
  addPendingAnalysis: null,
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
    analysis: {},
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
    ["classes", "Classes"],
    ["study", "Study Tools"],
    ["add", "+ Add New"],
  ];

  topNav.innerHTML = views
    .map(([key, label]) => {
      const isActive = state.activeView === key;
      const isAdd = key === "add";
      const classes = ["btn", isActive ? "tab-active" : "btn-ghost", isAdd ? "btn-addnew" : ""].join(" ");
      return `<button class="${classes}" data-view="${key}">${label}</button>`;
    })
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
  const upcoming = tasks.filter((task) => daysUntil(task.dueDate) >= 0).slice(0, 8);
  const highPriority = tasks.filter((task) => task.priority === "High").slice(0, 6);

  const stats = [
    ["Total Items", tasks.length],
    ["Upcoming Exams", tasks.filter((t) => t.type === "Exam" && daysUntil(t.dueDate) >= 0).length],
    ["Upcoming Projects", tasks.filter((t) => t.type === "Project" && daysUntil(t.dueDate) >= 0).length],
    ["Upcoming Assignments", tasks.filter((t) => t.type === "Assignment" && daysUntil(t.dueDate) >= 0).length],
    ["Due This Week", tasks.filter((t) => daysUntil(t.dueDate) <= 7 && daysUntil(t.dueDate) >= 0).length],
    ["Classes", Object.keys(groupByClass()).length],
  ];

  document.getElementById("stats-grid").innerHTML = stats
    .map(([label, value]) => `<article class="card stat-card"><h4>${label}</h4><p>${value}</p></article>`)
    .join("");

  document.getElementById("upcoming-list").innerHTML = renderTaskRows(upcoming, "No upcoming deadlines yet. Add your first item.");
  document.getElementById("priority-list").innerHTML = renderTaskRows(highPriority, "No high-priority items yet.");

  const recentUploads = allMaterials().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).slice(0, 6);

  document.getElementById("recent-uploads").innerHTML = recentUploads.length
    ? recentUploads
        .map(
          (item) =>
            `<article class="item-row"><div><strong>${escapeHtml(item.fileName)}</strong><small>${escapeHtml(
              item.taskTitle
            )} • ${escapeHtml(item.className)}</small></div><span class="tag ${item.type}">${item.type}</span></article>`
        )
        .join("")
    : `<p class="muted">No uploads yet. Add a task and upload PDF/TXT materials.</p>`;

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
  for (let i = 0; i < firstWeekday; i += 1) cells.push(buildCalendarCell(new Date(year, month, i - firstWeekday + 1), true));
  for (let day = 1; day <= end.getDate(); day += 1) cells.push(buildCalendarCell(new Date(year, month, day), false));
  while (cells.length % 7 !== 0) {
    const overflowDay = cells.length - (firstWeekday + end.getDate()) + 1;
    cells.push(buildCalendarCell(new Date(year, month + 1, overflowDay), true));
  }

  document.getElementById("calendar-grid").innerHTML = cells.join("");

  const upcoming = sortedByDate(state.data.tasks).filter((task) => daysUntil(task.dueDate) >= 0).slice(0, 12);
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
      const tasks = state.data.tasks.filter((task) => task.dueDate === cell.dataset.date);
      if (tasks.length) openItemDetail(tasks[0].id);
    });
  });

  bindTaskRowClicks();
}

function buildCalendarCell(date, outside) {
  const iso = toISO(date);
  const items = state.data.tasks.filter((task) => task.dueDate === iso).slice(0, 3);

  return `<article class="cal-cell ${outside ? "outside" : ""}" data-date="${iso}">
    <div class="cal-day">${date.getDate()}</div>
    ${items.map((task) => `<div class="cal-item ${task.type}">${escapeHtml(task.title)}</div>`).join("")}
  </article>`;
}

function renderAddNew() {
  const template = document.getElementById("add-view");
  app.innerHTML = "";
  app.appendChild(template.content.cloneNode(true));

  state.addPendingFiles = [];
  state.addPendingAnalysis = null;

  const uploadInput = document.getElementById("add-files");
  const uploadStatus = document.getElementById("add-upload-status");
  const uploadList = document.getElementById("add-upload-list");

  uploadInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    uploadStatus.textContent = "Reading files and analyzing material...";

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
        uploadedAt: new Date().toISOString(),
      });
    }

    const combinedText = state.addPendingFiles.map((f) => f.text).join("\n");
    state.addPendingAnalysis = analyzeStudyMaterial(combinedText);

    uploadStatus.textContent = `Prepared ${state.addPendingFiles.length} file(s). Material analysis complete.`;
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

    const files = [...state.addPendingFiles];
    state.data.materials[task.id] = files;

    const mergedText = `${task.notes}\n${files.map((f) => f.text).join("\n")}`;
    const analysis = analyzeStudyMaterial(mergedText);
    state.data.analysis[task.id] = analysis;

    // Auto-generation trigger on save
    state.data.outputs[task.id] = autoGenerateOutputs(task, analysis);
    state.data.chats[task.id] = [];

    persist();
    state.activeView = "dashboard";
    render();
  });
}

function analyzeStudyMaterial(text) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return { topics: [], keywords: [], sections: [], difficulty: "Low", complexityScore: 0 };

  const sectionCandidates = cleaned
    .split(/(?:\n\n+|\.|:)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 18)
    .slice(0, 16);

  const words = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !COMMON_WORDS.has(w));

  const freq = new Map();
  words.forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));

  const topKeywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);

  const topicMap = new Map();
  for (const section of sectionCandidates) {
    const name = toTopicName(section, topKeywords);
    topicMap.set(name, (topicMap.get(name) || 0) + 1);
  }

  const totalWeight = [...topicMap.values()].reduce((a, b) => a + b, 0) || 1;
  const topics = [...topicMap.entries()]
    .map(([name, count]) => ({ name, weight: Number((count / totalWeight).toFixed(2)) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  const complexityScore = Math.min(1, (words.length / 900) * 0.45 + (topKeywords.length / 15) * 0.35 + (topics.length / 10) * 0.2);
  const difficulty = complexityScore > 0.72 ? "High" : complexityScore > 0.42 ? "Medium" : "Low";

  return {
    topics,
    keywords: topKeywords,
    sections: sectionCandidates.slice(0, 8),
    difficulty,
    complexityScore: Number(complexityScore.toFixed(2)),
  };
}

function autoGenerateOutputs(task, analysis) {
  const outputs = {};

  if (task.type === "Exam") {
    outputs.studyPlan = generateExamStudyPlan(task, analysis);
    outputs.summary = generateExamSummary(task, analysis);
    outputs.checklist = generateExamChecklist(task, analysis);
  } else if (task.type === "Project") {
    outputs.studyPlan = generateProjectTimeline(task, analysis);
    outputs.summary = `Project Notes Summary\nPrimary focus areas: ${(analysis.topics || []).map((t) => t.name).join(", ") || "Define scope + deliverables"}.`;
    outputs.checklist = `Project Checklist\n☐ Research complete\n☐ Outline approved\n☐ Execution complete\n☐ Polish and QA complete`;
  } else {
    outputs.studyPlan = generateAssignmentPlan(task, analysis);
    outputs.summary = `Assignment Summary\nCore topics: ${(analysis.topics || []).map((t) => t.name).join(", ") || "task requirements"}.`;
    outputs.checklist = `Assignment Checklist\n☐ Understand prompt\n☐ Gather info\n☐ Complete work\n☐ Review + submit`;
  }

  return outputs;
}

function renderClasses() {
  const template = document.getElementById("classes-view");
  app.innerHTML = "";
  app.appendChild(template.content.cloneNode(true));

  const grouped = groupByClass();
  const container = document.getElementById("classes-grouped");
  if (!Object.keys(grouped).length) {
    container.innerHTML = `<p class="muted">No class items yet. Add a task in Add New.</p>`;
    return;
  }

  container.innerHTML = Object.entries(grouped)
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
    buttons.innerHTML = `<p class="muted">Add an item first to unlock generators.</p>`;
    output.textContent = "";
    return;
  }

  select.innerHTML = sortedByDate(state.data.tasks)
    .map((task) => `<option value="${task.id}">${escapeHtml(task.title)} (${task.type})</option>`)
    .join("");

  const selected = state.selectedStudyTaskId
    ? state.data.tasks.find((task) => task.id === state.selectedStudyTaskId)
    : sortedByDate(state.data.tasks)[0];

  if (selected) {
    state.selectedStudyTaskId = selected.id;
    select.value = selected.id;
    drawButtons(selected);
    output.textContent = getLastOutput(selected.id) || "Auto-generated outputs are saved when item is created.";
  }

  select.addEventListener("change", () => {
    const task = state.data.tasks.find((t) => t.id === select.value);
    if (!task) return;
    state.selectedStudyTaskId = task.id;
    drawButtons(task);
    output.textContent = getLastOutput(task.id) || "Auto-generated outputs are saved when item is created.";
  });

  function drawButtons(task) {
    const config = {
      Exam: [["studyPlan", "Study Plan"], ["summary", "Summary Notes"], ["questions", "Practice Questions"], ["flashcards", "Flashcards"]],
      Project: [["studyPlan", "Work Timeline"], ["summary", "Milestone Notes"], ["questions", "Risks / Blockers"], ["flashcards", "Phase Cards"]],
      Assignment: [["studyPlan", "Task Plan"], ["summary", "Summary"], ["questions", "Clarifying Questions"], ["flashcards", "Checklist Cards"]],
    };

    buttons.innerHTML = (config[task.type] || [])
      .map(([key, label]) => `<button class="btn btn-secondary" data-gen="${key}">${label}</button>`)
      .join("");

    buttons.querySelectorAll("[data-gen]").forEach((button) => {
      button.addEventListener("click", () => {
        const analysis = state.data.analysis[task.id] || analyzeStudyMaterial(task.notes || "");
        let generated;
        if (task.type === "Exam") generated = generateExamOutputByMode(task, analysis, button.dataset.gen);
        else if (task.type === "Project") generated = generateProjectOutputByMode(task, analysis, button.dataset.gen);
        else generated = generateAssignmentOutputByMode(task, analysis, button.dataset.gen);

        state.data.outputs[task.id][button.dataset.gen] = generated;
        task.updatedAt = new Date().toISOString();
        persist();
        output.textContent = generated;
      });
    });
  }
}

function generateExamOutputByMode(task, analysis, mode) {
  if (mode === "studyPlan") return generateExamStudyPlan(task, analysis);
  if (mode === "summary") return generateExamSummary(task, analysis);
  if (mode === "questions") return generateExamQuestions(task, analysis);
  return generateExamFlashcards(task, analysis);
}

function generateProjectOutputByMode(task, analysis, mode) {
  if (mode === "studyPlan") return generateProjectTimeline(task, analysis);
  if (mode === "summary") return `Milestone Notes\nCore tracks: ${(analysis.topics || []).map((t) => t.name).join(", ") || "requirements, implementation, polish"}.`;
  if (mode === "questions") return `Risks / Blockers\n- unclear scope\n- data/resource gaps\n- timeline risk\n- quality risk`;
  return `Phase Cards\nCard 1: Research\nCard 2: Outline\nCard 3: Execution\nCard 4: Polish`;
}

function generateAssignmentOutputByMode(task, analysis, mode) {
  if (mode === "studyPlan") return generateAssignmentPlan(task, analysis);
  if (mode === "summary") return `Assignment Summary\nThemes: ${(analysis.topics || []).map((t) => t.name).join(", ") || "task requirements"}`;
  if (mode === "questions") return `Questions to Clarify\n1) What rubric criteria matter most?\n2) Required format?\n3) Depth expectations?`;
  return `Checklist Cards\nCard 1: Understand\nCard 2: Gather info\nCard 3: Complete\nCard 4: Review`;
}

function generateExamStudyPlan(task, analysis) {
  const daysLeft = Math.max(1, daysUntil(task.dueDate));
  const topicPool = analysis.topics?.length ? analysis.topics : [{ name: "Core Concepts", weight: 1 }];
  const planDays = Math.min(daysLeft, 14);
  const lines = [];

  for (let day = 1; day <= planDays; day += 1) {
    const focusCount = day <= 2 ? 2 : 3;
    const dayTopics = [];

    for (let i = 0; i < focusCount; i += 1) {
      const topic = topicPool[(day + i - 1) % topicPool.length];
      const baseHours = 0.8 + topic.weight * 2.2;
      const hours = Number((day <= Math.ceil(planDays * 0.5) ? baseHours + 0.4 : baseHours).toFixed(1));
      dayTopics.push(`${topic.name} (${hours} hrs)`);
    }

    let suffix = "";
    if (day % 3 === 0) suffix = " • review block";
    if (day === planDays - 1) suffix = " • practice exam + correction";
    if (day === planDays) suffix = " • final review before exam";

    lines.push(`Day ${day}: ${dayTopics.join(" | ")}${suffix}`);
  }

  return `Smart Study Plan for ${task.title}
Days remaining: ${daysLeft}
Difficulty estimate: ${analysis.difficulty || "Medium"}
Hard topics: ${(analysis.topics || []).filter((t) => t.weight >= 0.2).map((t) => t.name).join(", ") || "Not enough material"}

${lines.map((line) => `- ${line}`).join("\n")}`;
}

function generateExamSummary(task, analysis) {
  return `Summary Notes
Top topics:
${(analysis.topics || []).slice(0, 8).map((t, i) => `${i + 1}) ${t.name} (weight ${t.weight})`).join("\n") || "No parsed topics yet."}

Keywords:
${(analysis.keywords || []).slice(0, 12).join(", ") || "No keywords yet."}`;
}

function generateExamQuestions(task, analysis) {
  const topics = (analysis.topics || []).map((t) => t.name);
  return `Practice Questions
1) Explain ${topics[0] || "the main concept"} with one example.
2) Compare ${topics[1] || "topic A"} and ${topics[2] || "topic B"}.
3) Solve a scenario using ${topics[3] || "a core method"}.
4) What mistakes are common in ${topics[0] || "this unit"}?`;
}

function generateExamFlashcards(task, analysis) {
  const topics = (analysis.topics || []).slice(0, 10);
  if (!topics.length) return "Flashcards\nCard 1\nFront: Main concept?\nBack: definition + one example.";
  return topics
    .map((t, i) => `Card ${i + 1}\nFront: ${t.name}\nBack: define it, explain why it matters, and add one quick example.`)
    .join("\n\n");
}

function generateProjectTimeline(task, analysis) {
  const daysLeft = Math.max(1, daysUntil(task.dueDate));
  return `Project Timeline (${daysLeft} day window)
Phase 1: Research (${Math.max(1, Math.floor(daysLeft * 0.2))} days)
Phase 2: Outline (${Math.max(1, Math.floor(daysLeft * 0.15))} days)
Phase 3: Execution (${Math.max(1, Math.floor(daysLeft * 0.45))} days)
Phase 4: Polish (${Math.max(1, Math.floor(daysLeft * 0.2))} days)

Topic anchors: ${(analysis.topics || []).slice(0, 4).map((t) => t.name).join(", ") || "scope, implementation, review"}.`;
}

function generateAssignmentPlan(task, analysis) {
  const daysLeft = Math.max(1, daysUntil(task.dueDate));
  return `Assignment Plan (${daysLeft} day window)
1) Understand task and rubric
2) Gather information/resources
3) Complete work draft
4) Review and polish

Estimated complexity: ${analysis.difficulty || "Medium"}
Focus topics: ${(analysis.topics || []).slice(0, 4).map((t) => t.name).join(", ") || "core assignment requirements"}`;
}

function generateExamChecklist(task, analysis) {
  return `Exam Checklist
☐ Complete daily plan blocks
☐ Finish at least 2 review blocks
☐ Take one practice exam
☐ Final review day before exam
☐ Revisit hard topics: ${(analysis.topics || []).slice(0, 3).map((t) => t.name).join(", ") || "N/A"}`;
}

function openItemDetail(taskId) {
  const task = state.data.tasks.find((item) => item.id === taskId);
  if (!task) return;

  const files = state.data.materials[task.id] || [];
  const outputs = state.data.outputs[task.id] || {};
  const analysis = state.data.analysis[task.id] || { topics: [], keywords: [], difficulty: "Low" };

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
    <ul class="file-list">${files.map((f) => `<li>${escapeHtml(f.fileName)} (${f.fileType})</li>`).join("") || "<li>No files uploaded.</li>"}</ul>
    <h3>Material Analysis</h3>
    <p class="muted">Difficulty: ${analysis.difficulty}. Topics: ${(analysis.topics || []).map((t) => t.name).join(", ") || "none"}</p>
    <h3>Generated Outputs</h3>
    <div class="output">${escapeHtml(
      Object.entries(outputs)
        .map(([key, value]) => `${key}:\n${value}`)
        .join("\n\n") || "No outputs yet."
    )}</div>
    <div class="action-row"><button id="delete-item" class="btn btn-danger">Delete Item</button></div>
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
  delete state.data.analysis[taskId];
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
      (task) => `<article class="item-row" data-task-id="${task.id}"><div><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(
        task.className
      )} • ${formatDate(task.dueDate)} • <span class="priority ${task.priority}">${task.priority}</span></small></div><span class="tag ${
        task.type
      }">${task.type}</span></article>`
    )
    .join("");
}

function bindTaskRowClicks() {
  app.querySelectorAll("[data-task-id]").forEach((row) => row.addEventListener("click", () => openItemDetail(row.dataset.taskId)));
}

function groupByClass() {
  const grouped = {};
  for (const task of state.data.tasks) {
    if (!grouped[task.className]) grouped[task.className] = [];
    grouped[task.className].push(task);
  }
  for (const key of Object.keys(grouped)) grouped[key].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
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

function toTopicName(section, keywords) {
  const tokens = section
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !COMMON_WORDS.has(w));

  const ranked = tokens
    .filter((token) => keywords.includes(token))
    .slice(0, 3)
    .join(" ");

  if (ranked) return ranked.replace(/\b\w/g, (c) => c.toUpperCase());
  return section.slice(0, 32).replace(/\b\w/g, (c) => c.toUpperCase());
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
  "found",
  "great",
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
