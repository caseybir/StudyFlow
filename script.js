const STORAGE_KEY = "studyflow_v3";
const app = document.getElementById("app");
const topNav = document.getElementById("top-nav");
const modal = document.getElementById("item-modal");

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.js";
}

const state = {
  activeView: "dashboard",
  monthCursor: new Date(),
  selectedDateISO: toISO(new Date()),
  selectedStudyItemId: null,
  selectedTool: null,
  pendingFiles: [],
  items: loadItems(),
};

setItems(state.items);
render();

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeItem) : [];
  } catch (error) {
    console.error("Failed to load localStorage data", error);
    return [];
  }
}

function normalizeItem(item) {
  return {
    id: item.id || crypto.randomUUID(),
    title: item.title || "Untitled",
    className: item.className || "Unassigned",
    professor: item.professor || "",
    type: (item.type || "assignment").toLowerCase(),
    dueDate: item.dueDate || toISO(addDays(new Date(), 7)),
    priority: (item.priority || "medium").toLowerCase(),
    difficulty: (item.difficulty || "medium").toLowerCase(),
    estimatedHours: Number(item.estimatedHours || 6),
    notes: item.notes || "",
    uploadedFiles: Array.isArray(item.uploadedFiles) ? item.uploadedFiles : [],
    extractedText: item.extractedText || "",
    generatedPlan: item.generatedPlan || defaultPlan(item.type || "assignment"),
    calendarEvents: Array.isArray(item.calendarEvents) ? item.calendarEvents : [],
    academicProfile: item.academicProfile || null,
    practiceQuestions: Array.isArray(item.practiceQuestions) ? item.practiceQuestions : [],
    summaryNotes: item.summaryNotes || "",
    deliverables: Array.isArray(item.deliverables) ? item.deliverables : [],
    progress: item.progress || { completedSessions: [], percent: 0, readiness: "Low" },
    warnings: Array.isArray(item.warnings) ? item.warnings : [],
    nextAction: item.nextAction || null,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function defaultPlan(type) {
  const planType = String(type).toLowerCase();
  if (planType === "exam") return { startDate: "", studyDays: [] };
  return { startDate: "", steps: [] };
}

function persistItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}

function setItems(nextItems) {
  const deduped = [];
  const seen = new Set();
  for (const item of nextItems.map((entry) => enrichItem(normalizeItem(entry)))) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  state.items = deduped;
  persistItems();
}

function enrichItem(item) {
  const profile = item.academicProfile || analyzeAcademicContent(item);
  const generatedPlan = item.generatedPlan?.startDate ? item.generatedPlan : generatePlan(item, profile);
  const enriched = {
    ...item,
    academicProfile: profile,
    generatedPlan,
    calendarEvents: buildCalendarEvents({ ...item, generatedPlan }),
    practiceQuestions: item.practiceQuestions?.length ? item.practiceQuestions : generatePracticeQuestions(item, profile),
    summaryNotes: item.summaryNotes || generateSummaryNotes(item, profile),
    deliverables: item.deliverables?.length ? item.deliverables : generateDeliverables(item),
  };
  enriched.progress = computeProgress(enriched);
  enriched.warnings = buildRiskWarnings(enriched);
  enriched.nextAction = computeNextAction(enriched);
  return enriched;
}

function render() {
  renderTopNav();
  if (state.activeView === "dashboard") renderDashboard();
  if (state.activeView === "calendar") renderCalendar();
  if (state.activeView === "classes") renderClasses();
  if (state.activeView === "study") renderStudyTools();
  if (state.activeView === "add") renderAddForm();
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
      const classes = ["btn", state.activeView === key ? "tab-active" : "btn-ghost", key === "add" ? "btn-addnew" : ""]
        .filter(Boolean)
        .join(" ");
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
  app.innerHTML = "";
  app.appendChild(document.getElementById("dashboard-view").content.cloneNode(true));

  const items = sortedByDueDate(state.items);
  const upcoming = items.filter((item) => daysUntil(item.dueDate) >= 0).slice(0, 8);
  const highPriority = items.filter((item) => item.priority === "high").slice(0, 8);
  const recentUploads = collectRecentUploads().slice(0, 8);
  const upcomingSessions = allCalendarEvents()
    .filter((event) => event.colorClass === "session" && daysUntil(event.date) >= 0)
    .sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`));
  const workload = computeWorkloadInsights(state.items);
  const nextAction = computeGlobalNextAction(state.items);
  const todayISO = toISO(new Date());
  const todaySchedule = buildDailySchedule(state.items, todayISO);
  const weekSchedule = buildWeekSchedule(state.items);

  const stats = [
    ["Total Items", items.length],
    ["Upcoming Exams", items.filter((item) => item.type === "exam" && daysUntil(item.dueDate) >= 0).length],
    ["Upcoming Projects", items.filter((item) => item.type === "project" && daysUntil(item.dueDate) >= 0).length],
    ["Upcoming Assignments", items.filter((item) => item.type === "assignment" && daysUntil(item.dueDate) >= 0).length],
    ["Due This Week", items.filter((item) => daysUntil(item.dueDate) >= 0 && daysUntil(item.dueDate) <= 7).length],
  ];

  document.getElementById("stats-grid").innerHTML = stats
    .map(([label, value]) => `<article class="card stat-card"><h4>${label}</h4><p>${value}</p></article>`)
    .join("");

  document.getElementById("upcoming-list").innerHTML = renderItemRows(upcoming, "No upcoming deadlines.");
  document.getElementById("priority-list").innerHTML = renderItemRows(highPriority, "No high-priority items.");
  document.getElementById("next-action-panel").innerHTML = nextAction
    ? `<article class="banner-ok"><strong>${escapeHtml(nextAction.title)}</strong><p>${escapeHtml(nextAction.description)}</p></article>`
    : `<p class="muted">Add an item to generate your next best action.</p>`;

  document.getElementById("today-plan").innerHTML = todaySchedule.length
    ? todaySchedule.map((entry) => `<article class="item-row" data-item-id="${entry.itemId}"><div><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.duration)} • ${escapeHtml(entry.label)}</small></div><span class="chevron">›</span></article>`).join("")
    : `<p class="muted">No blocks scheduled for today.</p>`;
  document.getElementById("week-plan").innerHTML = weekSchedule.length
    ? weekSchedule.map((day) => `<article><strong>${escapeHtml(day.dayLabel)}:</strong> ${day.blocks.length} block(s), ${day.totalHours.toFixed(1)} hrs</article>`).join("")
    : `<p class="muted">No week schedule generated yet.</p>`;
  document.getElementById("next-study-block").innerHTML = upcomingSessions.length
    ? renderEventRows(upcomingSessions.slice(0, 3), "No study sessions generated yet.")
    : `<p class="muted">No study sessions yet. Add an item to generate a plan.</p>`;

  const overdue = items.filter((item) => daysUntil(item.dueDate) < 0);
  const nextDue = items.find((item) => daysUntil(item.dueDate) >= 0);
  const alerts = [`<p class="${workload.overloaded ? "banner-warning" : "banner-ok"}">${escapeHtml(workload.message)}</p>`];
  if (overdue.length) alerts.push(`<p><span class="pill priority high">Overdue</span> ${overdue.length} item(s) need attention now.</p>`);
  if (nextDue) alerts.push(`<p><span class="pill">Next Due</span> ${escapeHtml(nextDue.title)} on ${formatDate(nextDue.dueDate)}.</p>`);
  if (upcomingSessions[0]) alerts.push(`<p><span class="pill">Next Session</span> ${escapeHtml(upcomingSessions[0].title)} on ${formatDate(upcomingSessions[0].date)}.</p>`);
  document.getElementById("dashboard-alerts").innerHTML = alerts.join("") || `<p class="muted">You're all caught up. Nice work ✨</p>`;
  document.getElementById("recent-uploads").innerHTML = recentUploads.length
    ? recentUploads
        .map(
          (upload) => `<article class="item-row" data-item-id="${upload.itemId}">
              <div>
                <strong>${escapeHtml(upload.fileName)}</strong>
                <small>${escapeHtml(upload.itemTitle)} • ${escapeHtml(upload.className)} • ${formatDate(upload.uploadedAt.slice(0, 10))}</small>
              </div>
              <span class="chevron">›</span>
            </article>`
        )
        .join("")
    : `<p class="muted">No uploads yet. Add an item with PDF or TXT files.</p>`;

  app.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeView = button.dataset.nav;
      render();
    });
  });

  bindItemClicks();
  bindEventClicks();
}

function renderAddForm(prefillItem = null) {
  app.innerHTML = "";
  app.appendChild(document.getElementById("add-view").content.cloneNode(true));

  const form = document.getElementById("add-form");
  const fileInput = document.getElementById("add-files");
  const status = document.getElementById("add-upload-status");
  const uploadList = document.getElementById("add-upload-list");
  const resetButton = document.getElementById("reset-add");

  state.pendingFiles = [];

  if (prefillItem) {
    form.title.value = prefillItem.title;
    form.className.value = prefillItem.className;
    form.professor.value = prefillItem.professor || "";
    form.type.value = prefillItem.type;
    form.dueDate.value = prefillItem.dueDate;
    form.priority.value = prefillItem.priority;
    form.difficulty.value = prefillItem.difficulty || "medium";
    form.estimatedHours.value = prefillItem.estimatedHours || 6;
    form.notes.value = prefillItem.notes || "";
    state.pendingFiles = [...prefillItem.uploadedFiles];
    uploadList.innerHTML = state.pendingFiles
      .map((file) => `<li>${escapeHtml(file.fileName)} (${file.fileType.toUpperCase()})</li>`)
      .join("");
    status.textContent = "Loaded existing files. You can add more.";
  }

  fileInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    status.textContent = "Processing files...";

    for (const file of files) {
      const ext = getExt(file.name);
      if (!["pdf", "txt"].includes(ext)) continue;

      let extracted = "";
      let extractionError = "";
      if (ext === "txt") {
        extracted = await file.text();
      } else {
        try {
          extracted = await extractPdfText(file);
        } catch (error) {
          extractionError = "We could not extract text from this PDF. The item can still be saved.";
          console.error("PDF extraction failed", error);
        }
      }

      state.pendingFiles.push({
        id: crypto.randomUUID(),
        fileName: file.name,
        fileType: ext,
        text: extracted,
        uploadedAt: new Date().toISOString(),
        extractionError,
      });
    }

    uploadList.innerHTML = state.pendingFiles
      .map(
        (file) => `<li>${escapeHtml(file.fileName)} (${file.fileType.toUpperCase()}) ${
          file.extractionError ? `<span class="priority high">- ${escapeHtml(file.extractionError)}</span>` : ""
        }</li>`
      )
      .join("");
    status.textContent = `${state.pendingFiles.length} file(s) ready.`;
    fileInput.value = "";
  });

  resetButton.addEventListener("click", () => renderAddForm(prefillItem));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = Object.fromEntries(new FormData(form));

    if (!formData.title.trim() || !formData.className.trim() || !formData.dueDate) {
      status.textContent = "Please fill in title, class name, and due date.";
      return;
    }

    const baseItem = {
      id: prefillItem ? prefillItem.id : crypto.randomUUID(),
      title: formData.title.trim(),
      className: formData.className.trim(),
      professor: (formData.professor || "").trim(),
      type: formData.type.toLowerCase(),
      dueDate: formData.dueDate,
      priority: formData.priority.toLowerCase(),
      difficulty: (formData.difficulty || "medium").toLowerCase(),
      estimatedHours: Number(formData.estimatedHours || 6),
      notes: (formData.notes || "").trim(),
      uploadedFiles: state.pendingFiles,
      extractedText: state.pendingFiles.map((file) => file.text || "").join("\n\n").trim(),
      createdAt: prefillItem ? prefillItem.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    baseItem.academicProfile = analyzeAcademicContent(baseItem);
    baseItem.generatedPlan = generatePlan(baseItem, baseItem.academicProfile);
    baseItem.calendarEvents = buildCalendarEvents(baseItem);
    baseItem.practiceQuestions = generatePracticeQuestions(baseItem, baseItem.academicProfile);
    baseItem.summaryNotes = generateSummaryNotes(baseItem, baseItem.academicProfile);
    baseItem.deliverables = generateDeliverables(baseItem);
    baseItem.progress = computeProgress(baseItem);
    baseItem.warnings = buildRiskWarnings(baseItem);
    baseItem.nextAction = computeNextAction(baseItem);

    if (prefillItem) {
      setItems(state.items.map((item) => (item.id === baseItem.id ? baseItem : item)));
      closeModal();
    } else {
      setItems([...state.items, baseItem]);
    }

    state.activeView = "dashboard";
    render();
  });
}

function renderCalendar() {
  app.innerHTML = "";
  app.appendChild(document.getElementById("calendar-view").content.cloneNode(true));

  const year = state.monthCursor.getFullYear();
  const month = state.monthCursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const events = allCalendarEvents();

  document.getElementById("calendar-title").textContent = firstDay.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  document.getElementById("calendar-weekdays").innerHTML = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    .map((day) => `<div>${day}</div>`)
    .join("");

  const cells = [];
  for (let i = 0; i < firstDay.getDay(); i += 1) {
    cells.push(calendarCell(new Date(year, month, i - firstDay.getDay() + 1), true, events));
  }
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    cells.push(calendarCell(new Date(year, month, day), false, events));
  }
  while (cells.length % 7 !== 0) {
    cells.push(calendarCell(new Date(year, month + 1, cells.length - (firstDay.getDay() + lastDay.getDate()) + 1), true, events));
  }

  document.getElementById("calendar-grid").innerHTML = cells.join("");

  const upcoming = events
    .filter((event) => daysUntil(event.date) >= 0)
    .sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`))
    .slice(0, 12);

  document.getElementById("calendar-upcoming").innerHTML = renderEventRows(upcoming, "No upcoming events.");
  renderDayEvents(state.selectedDateISO);
  document.getElementById("week-overview").innerHTML = buildWeekSchedule(state.items)
    .map((day) => `<article><strong>${escapeHtml(day.dayLabel)}</strong> — ${day.blocks.map((b) => `${escapeHtml(b.title)} (${escapeHtml(b.duration)})`).join(", ") || "No blocks"}</article>`)
    .join("");

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
      state.selectedDateISO = cell.dataset.date;
      renderCalendar();
    });
  });

  bindEventClicks();
}

function renderDayEvents(dateISO) {
  const events = allCalendarEvents().filter((event) => event.date === dateISO);
  document.getElementById("day-events").innerHTML = renderEventRows(events, `No events for ${formatDate(dateISO)}.`);
  bindEventClicks();
}

function calendarCell(date, outside, events) {
  const iso = toISO(date);
  const dayEvents = events.filter((event) => event.date === iso).slice(0, 3);
  const selectedClass = state.selectedDateISO === iso ? "selected" : "";
  return `<article class="cal-cell ${outside ? "outside" : ""} ${selectedClass}" data-date="${iso}">
      <div class="cal-day">${date.getDate()}</div>
      ${dayEvents.map((event) => `<div class="cal-item ${event.colorClass}">${escapeHtml(event.title)}</div>`).join("")}
    </article>`;
}

function renderClasses() {
  app.innerHTML = "";
  app.appendChild(document.getElementById("classes-view").content.cloneNode(true));

  const grouped = state.items.reduce((acc, item) => {
    if (!acc[item.className]) acc[item.className] = [];
    acc[item.className].push(item);
    return acc;
  }, {});

  const root = document.getElementById("classes-grouped");
  const classNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
  if (!classNames.length) {
    root.innerHTML = `<p class="muted">No class items yet. Add one with + Add New.</p>`;
    return;
  }

  root.innerHTML = classNames
    .map((className) => {
      const rows = grouped[className]
        .sort((a, b) => new Date(`${a.dueDate}T00:00:00`) - new Date(`${b.dueDate}T00:00:00`))
        .map(
          (item) => `<article class="item-row" data-item-id="${item.id}">
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <small>${titleCase(item.type)} • ${formatDate(item.dueDate)} • <span class="priority ${item.priority}">${titleCase(item.priority)}</span></small>
              </div>
              <span class="chevron">›</span>
            </article>`
        )
        .join("");
      return `<article class="class-block"><h3>${escapeHtml(className)}</h3><div class="list">${rows}</div></article>`;
    })
    .join("");

  bindItemClicks();
}

function renderStudyTools() {
  app.innerHTML = "";
  app.appendChild(document.getElementById("study-view").content.cloneNode(true));

  const select = document.getElementById("study-select");
  const buttons = document.getElementById("study-buttons");
  const output = document.getElementById("study-output");
  const empty = document.getElementById("study-empty");
  const openDetail = document.getElementById("study-open-detail");

  if (!state.items.length) {
    select.innerHTML = `<option value="">No items available</option>`;
    buttons.innerHTML = "";
    output.innerHTML = "";
    empty.textContent = "Add an item first to use Study Tools.";
    openDetail.disabled = true;
    return;
  }

  const items = sortedByDueDate(state.items);
  const selected = items.find((item) => item.id === state.selectedStudyItemId) || items[0];
  state.selectedStudyItemId = selected.id;

  select.innerHTML = items.map((item) => `<option value="${item.id}">${escapeHtml(item.title)} (${titleCase(item.type)})</option>`).join("");
  select.value = selected.id;

  const toolMap = {
    exam: ["dailyPlan", "summary", "questions", "flashcards"],
    project: ["timeline", "milestones", "risks", "phaseCards"],
    assignment: ["breakdown", "timeEstimate", "checklist", "clarify"],
  };

  const labelMap = {
    dailyPlan: "Daily Study Plan",
    summary: "Summary Notes",
    questions: "Practice Questions",
    flashcards: "Flashcards",
    timeline: "Work Timeline",
    milestones: "Milestones",
    risks: "Risks / Blockers",
    phaseCards: "Phase Cards",
    breakdown: "Step Breakdown",
    timeEstimate: "Time Estimate",
    checklist: "Checklist",
    clarify: "Clarify Questions",
  };

  const availableTools = toolMap[selected.type];
  if (!availableTools.includes(state.selectedTool)) state.selectedTool = availableTools[0];

  function drawToolView(item) {
    buttons.innerHTML = availableTools
      .map(
        (toolKey) => `<button class="btn btn-secondary ${state.selectedTool === toolKey ? "tool-btn-active" : ""}" data-tool="${toolKey}">${labelMap[toolKey]}</button>`
      )
      .join("");

    const content = buildStudyToolContent(item, state.selectedTool);
    output.innerHTML = `<div class="panel"><h3>${labelMap[state.selectedTool]}</h3>${content}</div>`;
    empty.textContent = "";

    buttons.querySelectorAll("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedTool = button.dataset.tool;
        drawToolView(item);
      });
    });
  }

  drawToolView(selected);

  select.addEventListener("change", () => {
    const item = items.find((candidate) => candidate.id === select.value);
    if (!item) return;
    state.selectedStudyItemId = item.id;
    state.selectedTool = null;
    renderStudyTools();
  });

  openDetail.addEventListener("click", () => openDetailModal(state.selectedStudyItemId));
}

function buildStudyToolContent(item, toolKey) {
  const topics = inferTopics(item).slice(0, 6);
  const notesSummary = item.notes || "No notes provided yet.";

  if (item.type === "exam") {
    const studyDays = item.generatedPlan.studyDays || [];
    if (toolKey === "dailyPlan") {
      return studyDays.length
        ? `<ul>${studyDays
            .map((entry) => `<li><strong>${formatDate(entry.date)}:</strong> ${escapeHtml(entry.topic)} (${escapeHtml(entry.duration)}) - ${escapeHtml(entry.description)}</li>`)
            .join("")}</ul>`
        : `<p>No study plan generated yet.</p>`;
    }
    if (toolKey === "summary") return `<p>${escapeHtml(item.summaryNotes || notesSummary)}</p><p><strong>Key topics:</strong> ${escapeHtml(topics.join(", ") || "None detected")}</p>`;
    if (toolKey === "questions") return `<ol>${(item.practiceQuestions || topics.map((topic) => ({ question: `Explain ${topic} and give one applied example.` }))).map((q) => `<li>${escapeHtml(q.question || q)}</li>`).join("")}</ol>`;
    return `<ul>${topics.map((topic) => `<li><strong>Q:</strong> ${escapeHtml(topic)}<br /><strong>A:</strong> Define it in your own words and give one example.</li>`).join("")}</ul>`;
  }

  const steps = item.generatedPlan.steps || [];
  if (item.type === "project") {
    if (toolKey === "timeline") return `<ul>${steps.map((step) => `<li><strong>${formatDate(step.date)}:</strong> ${escapeHtml(step.title)} (${escapeHtml(step.duration)})</li>`).join("")}</ul>`;
    if (toolKey === "milestones") return `<ol>${steps.map((step) => `<li>${escapeHtml(step.title)} - ${escapeHtml(step.description)}</li>`).join("")}</ol>`;
    if (toolKey === "risks") return `<ul>${buildRiskList(item, topics).map((risk) => `<li>${escapeHtml(risk)}</li>`).join("")}</ul>`;
    return `<div>${steps.map((step) => `<p><strong>${escapeHtml(step.title)}:</strong> ${escapeHtml(step.duration)} | ${formatDate(step.date)}</p>`).join("")}</div>`;
  }

  if (toolKey === "breakdown") return `<ul>${steps.map((step) => `<li><strong>${escapeHtml(step.title)}:</strong> ${escapeHtml(step.description)}</li>`).join("")}</ul>`;
  if (toolKey === "timeEstimate") return `<ul>${steps.map((step) => `<li>${escapeHtml(step.title)} - ${escapeHtml(step.duration)}</li>`).join("")}</ul>`;
  if (toolKey === "checklist") return `<ul>${(item.deliverables?.length ? item.deliverables : steps.map((step) => step.title)).map((entry) => `<li>☐ ${escapeHtml(entry)}</li>`).join("")}</ul>`;
  return `<ol>${topics.map((topic) => `<li>Should I clarify expectations for: ${escapeHtml(topic)}?</li>`).join("")}</ol>`;
}

function buildRiskList(item, topics) {
  const risks = [
    "Scope creep could expand workload beyond available days.",
    "Research sources may be weaker than expected; validate early.",
    "Final polish might be rushed if milestone deadlines slip.",
  ];
  if (topics.length) risks.push(`Watch complexity around: ${topics.slice(0, 2).join(", ")}.`);
  if (item.notes.length < 20) risks.push("Add clearer requirements in notes to avoid ambiguity.");
  return risks;
}

function openDetailModal(itemId) {
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return;

  const tabContent = {
    overview: () => `<div class="kv">
      <p><strong>Title:</strong> ${escapeHtml(item.title)}</p>
      <p><strong>Type:</strong> ${titleCase(item.type)}</p>
      <p><strong>Class:</strong> ${escapeHtml(item.className)}</p>
      <p><strong>Professor:</strong> ${escapeHtml(item.professor || "Not set")}</p>
      <p><strong>Due Date:</strong> ${formatDate(item.dueDate)}</p>
      <p><strong>Priority:</strong> <span class="priority ${item.priority}">${titleCase(item.priority)}</span></p>
      <p><strong>Difficulty:</strong> ${titleCase(item.difficulty)} • <strong>Estimated Hours:</strong> ${item.estimatedHours}</p>
      <p><strong>Notes:</strong> ${escapeHtml(item.notes || "No notes")}</p>
      <p><strong>Next Recommended Action:</strong> ${escapeHtml(item.nextAction?.title || "No action generated yet")}</p>
      <p><strong>Status:</strong> <span class="pill">${escapeHtml(urgencyLabel(item))}</span></p>
      <div class="progress"><span style="width:${item.progress.percent}%;"></span></div>
      <p>${item.progress.percent}% complete • ${item.progress.completedSessions.length} completed sessions • Readiness: ${escapeHtml(item.progress.readiness)}</p>
      ${(item.warnings || []).map((warning) => `<p class="banner-warning">${escapeHtml(warning)}</p>`).join("")}
    </div>`,
    timeline: () => renderPlanTimeline(item),
    materials: () => `<div>
      <p><strong>Material summary:</strong> <span class="warm-note">${escapeHtml(item.summaryNotes || "No summary generated yet.")}</span></p>
      <p><strong>Uploaded files:</strong></p>
      <ul class="file-list">${
        item.uploadedFiles.length
          ? item.uploadedFiles
              .map((file) => `<li>${escapeHtml(file.fileName)} (${file.fileType.toUpperCase()}) ${file.extractionError ? `- ${escapeHtml(file.extractionError)}` : ""}</li>`)
              .join("")
          : "<li>No files uploaded.</li>"
      }</ul>
      <p><strong>Extracted text:</strong></p>
      <p class="muted">${escapeHtml(item.extractedText.slice(0, 2500) || "No extracted text available.")}</p>
    </div>`,
    generated: () => `<div>${renderGeneratedPlanJSON(item.generatedPlan)}</div>`,
    practice: () => `<div>
      <p><strong>Summary Notes</strong></p>
      <p class="muted">${escapeHtml(item.summaryNotes || "No summary generated yet.")}</p>
      <p><strong>Practice Questions</strong></p>
      ${(item.practiceQuestions || []).map((q, index) => `<div class="practice-card"><p><strong>Prompt:</strong> ${escapeHtml(q.question || q)}</p><button class="btn btn-secondary" data-answer-id="${item.id}-${index}">Show Answer</button><p id="answer-${item.id}-${index}" class="muted" style="display:none;">${escapeHtml(q.answer || "Build your answer from notes and examples.")}</p></div>`).join("") || "<p>No practice questions yet.</p>"}
      <p><strong>Deliverables / Checklist</strong></p>
      <ul>${(item.deliverables || []).map((d, idx) => `<li><label><input type="checkbox" data-progress-item="${item.id}" data-progress-index="${idx}" ${item.progress.completedSessions.includes(d) ? "checked" : ""}/> ${escapeHtml(d)}</label></li>`).join("") || "<li>No deliverables listed yet.</li>"}</ul>
      <button class="btn btn-primary" data-focus-item="${item.id}">Start Focus Mode</button>
    </div>`,
  };

  modal.innerHTML = `<div class="modal-head">
      <h2>${escapeHtml(item.title)}</h2>
      <button id="close-modal" class="btn btn-ghost">Close</button>
    </div>
    <div class="modal-tabs">
      <button class="btn btn-secondary tool-btn-active" data-tab="overview">Overview</button>
      <button class="btn btn-secondary" data-tab="timeline">Timeline</button>
      <button class="btn btn-secondary" data-tab="materials">Materials</button>
      <button class="btn btn-secondary" data-tab="generated">Generated Plan</button>
      <button class="btn btn-secondary" data-tab="practice">Practice & Deliverables</button>
    </div>
    <div id="modal-content" class="modal-content"></div>
    <div class="action-row" style="margin-top: 0.8rem;">
      <button id="edit-item" class="btn btn-ghost">Edit</button>
      <button id="delete-item" class="btn btn-danger">Delete</button>
    </div>`;

  modal.showModal();
  setModalTab("overview");

  modal.querySelector("#close-modal").addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  }, { once: true });

  modal.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => setModalTab(button.dataset.tab));
  });

  modal.querySelector("#edit-item").addEventListener("click", () => {
    state.activeView = "add";
    closeModal();
    renderAddForm(item);
  });

  modal.querySelector("#delete-item").addEventListener("click", () => {
    const confirmed = window.confirm(`Delete "${item.title}"? This cannot be undone.`);
    if (!confirmed) return;
    setItems(state.items.filter((entry) => entry.id !== item.id));
    closeModal();
    if (state.selectedStudyItemId === item.id) state.selectedStudyItemId = null;
    render();
  });

  function setModalTab(tab) {
    modal.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle("tool-btn-active", button.dataset.tab === tab);
    });
    modal.querySelector("#modal-content").innerHTML = tabContent[tab]();
    modal.querySelectorAll("[data-answer-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const answer = modal.querySelector(`#answer-${btn.dataset.answerId}`);
        if (!answer) return;
        answer.style.display = answer.style.display === "none" ? "block" : "none";
      });
    });
    modal.querySelectorAll("[data-progress-item]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => toggleProgressSession(item.id, item.deliverables[Number(checkbox.dataset.progressIndex)], checkbox.checked));
    });
    modal.querySelectorAll("[data-focus-item]").forEach((btn) => btn.addEventListener("click", () => openFocusMode(btn.dataset.focusItem)));
  }
}

function closeModal() {
  if (modal.open) modal.close();
}

function renderPlanTimeline(item) {
  if (item.type === "exam") {
    const studyDays = item.generatedPlan.studyDays || [];
    if (!studyDays.length) return `<p class="muted">No study timeline generated yet.</p>`;
    return `<ul>${studyDays
      .map((day) => `<li><strong>${formatDate(day.date)}:</strong> ${escapeHtml(day.topic)} (${escapeHtml(day.duration)})<br /><span class="muted">${escapeHtml(day.description)}</span></li>`)
      .join("")}</ul>`;
  }

  const steps = item.generatedPlan.steps || [];
  if (!steps.length) return `<p class="muted">No timeline generated yet.</p>`;
  return `<ul>${steps
    .map((step) => `<li><strong>${formatDate(step.date)}:</strong> ${escapeHtml(step.title)} (${escapeHtml(step.duration)})<br /><span class="muted">${escapeHtml(step.description)}</span></li>`)
    .join("")}</ul>`;
}

function renderGeneratedPlanJSON(plan) {
  return `<pre>${escapeHtml(JSON.stringify(plan, null, 2))}</pre>`;
}

function renderItemRows(items, emptyMessage) {
  if (!items.length) return `<p class="muted">${emptyMessage}</p>`;
  return items
    .map(
      (item) => `<article class="item-row" data-item-id="${item.id}">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.className)} • ${titleCase(item.type)} • ${formatDate(item.dueDate)} • <span class="priority ${item.priority}">${titleCase(item.priority)}</span></small>
          </div>
          <span class="chevron">›</span>
        </article>`
    )
    .join("");
}

function renderEventRows(events, emptyMessage) {
  if (!events.length) return `<p class="muted">${emptyMessage}</p>`;
  return events
    .map(
      (event) => `<article class="item-row" data-item-id="${event.itemId}">
          <div>
            <strong>${escapeHtml(event.title)}</strong>
            <small>${formatDate(event.date)} • ${escapeHtml(event.label)} • ${escapeHtml(event.parentTitle)}</small>
          </div>
          <div class="action-row">
            <span class="tag ${event.colorClass}">${titleCase(event.colorClass)}</span>
            ${event.colorClass === "session" ? `<button class="btn btn-ghost" data-reschedule="${event.itemId}" data-event-title="${encodeURIComponent(event.title)}" data-shift="1">Move +1d</button>` : ""}
          </div>
        </article>`
    )
    .join("");
}

function bindItemClicks() {
  app.querySelectorAll("[data-item-id]").forEach((element) => {
    element.addEventListener("click", () => openDetailModal(element.dataset.itemId));
  });
}

function bindEventClicks() {
  app.querySelectorAll("[data-item-id]").forEach((element) => {
    element.addEventListener("click", () => openDetailModal(element.dataset.itemId));
  });
  app.querySelectorAll("[data-reschedule]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      rescheduleSession(button.dataset.reschedule, decodeURIComponent(button.dataset.eventTitle), Number(button.dataset.shift || 1));
    });
  });
}

function collectRecentUploads() {
  return state.items
    .flatMap((item) =>
      item.uploadedFiles.map((file) => ({
        itemId: item.id,
        itemTitle: item.title,
        className: item.className,
        fileName: file.fileName,
        uploadedAt: file.uploadedAt || item.updatedAt,
      }))
    )
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

function allCalendarEvents() {
  return state.items
    .flatMap((item) => {
      const dueEvent = {
        itemId: item.id,
        parentTitle: item.title,
        title: `${item.title} (Due)`,
        date: item.dueDate,
        label: `${titleCase(item.type)} due`,
        colorClass: item.type,
      };
      return [dueEvent, ...item.calendarEvents.map((event) => ({ ...event, itemId: item.id, parentTitle: item.title }))];
    })
    .filter((event) => Boolean(event.date));
}

function buildCalendarEvents(item) {
  if (item.type === "exam") {
    return (item.generatedPlan.studyDays || []).map((day) => ({
      title: day.topic,
      date: day.date,
      label: "Study session",
      colorClass: "session",
    }));
  }

  return (item.generatedPlan.steps || []).map((step) => ({
    title: step.title,
    date: step.date,
    label: item.type === "project" ? "Project step" : "Assignment step",
    colorClass: "session",
  }));
}

function generatePlan(item, profile = analyzeAcademicContent(item)) {
  if (item.type === "exam") return generateExamPlan(item, profile);
  if (item.type === "project") return generateProjectPlan(item, profile);
  return generateAssignmentPlan(item);
}

function generateExamPlan(item, profile) {
  const due = new Date(`${item.dueDate}T00:00:00`);
  const topics = profile.majorTopics.length ? [...profile.majorTopics, ...profile.minorTopics] : inferTopics(item);
  const daysAvailable = Math.max(4, Math.min(14, daysUntil(item.dueDate) || 6));
  const hourFactor = Math.max(1, item.estimatedHours / 6);
  const priorityBias = item.priority === "high" ? 2 : item.priority === "medium" ? 1 : 0;
  const start = addDays(due, -(daysAvailable + priorityBias));
  const studyDays = [];

  for (let i = 0; i < daysAvailable; i += 1) {
    const date = toISO(addDays(start, i));
    const isReview = i > 0 && i % 3 === 0;
    const isFinalReview = i === daysAvailable - 1;

    if (isFinalReview) {
      studyDays.push({
        date,
        topic: "Final Review + Confidence Pass",
        duration: "90 min",
        description: "Revisit weak areas, complete one mixed practice set, and prepare exam-day checklist.",
      });
      continue;
    }

    if (isReview) {
      const topicSlice = topics.slice(0, 3).join(", ") || "core concepts";
      studyDays.push({
        date,
        topic: `Review Day: ${topicSlice}`,
        duration: "75 min",
        description: "Use spaced repetition and timed recall on previous topics.",
      });
      continue;
    }

    const topic = topics[i % topics.length] || "Core material";
    const topicWeight = profile.topicWeights[topic.toLowerCase()] || 1;
    studyDays.push({
      date,
      topic,
      duration: `${Math.round((55 + (i % 2) * 25) * topicWeight * hourFactor)} min`,
      description: `Learn and summarize ${topic}; finish with active recall and 5 self-test questions.`,
    });
  }

  return { startDate: toISO(start), studyDays };
}

function generateProjectPlan(item, profile) {
  const due = new Date(`${item.dueDate}T00:00:00`);
  const scopeBias = Math.max(0, Math.min(5, Math.floor(profile.scopeScore / 2) + (item.difficulty === "hard" ? 2 : 0)));
  const daysAvailable = Math.max(7, Math.min(30, (daysUntil(item.dueDate) || 10) + scopeBias));
  const start = addDays(due, -daysAvailable);

  const phases = [
    ["Scope & Requirements", 0.18, "2 hrs", "Clarify deliverables, rubric, and acceptance criteria."],
    ["Research & Sources", 0.22, "3 hrs", "Collect references, examples, and data inputs."],
    ["Build Draft", 0.32, `${4 + scopeBias * 0.5} hrs`, "Create first complete version and core implementation."],
    ["Revision & QA", 0.18, "2.5 hrs", "Fix issues, tighten structure, and improve quality."],
    ["Final Packaging", 0.1, "1 hr", "Prepare submission, format files, and final checks."],
  ];

  let cursor = new Date(start);
  const steps = phases.map(([title, ratio, duration, description], index) => {
    const offset = index === phases.length - 1 ? 0 : Math.max(1, Math.floor(daysAvailable * ratio));
    const stepDate = toISO(cursor);
    cursor = addDays(cursor, offset);
    return { date: stepDate, title, duration, description };
  });

  return { startDate: toISO(start), steps };
}

function generateAssignmentPlan(item) {
  const due = new Date(`${item.dueDate}T00:00:00`);
  const daysAvailable = Math.max(3, Math.min(12, (daysUntil(item.dueDate) || 5) + (item.difficulty === "hard" ? 1 : 0)));
  const start = addDays(due, -daysAvailable);

  const stepsTemplate = [
    ["Understand Prompt", "30 min", "Read instructions and identify required output format."],
    ["Collect Notes & Sources", "45 min", "Gather lecture notes, examples, and references."],
    ["Draft Response", "60-90 min", "Complete first pass with clear structure."],
    ["Revise for Accuracy", "45 min", "Check logic, citations, and rubric alignment."],
    ["Final Submission Check", "20 min", "Proofread and submit with required attachments."],
  ];

  const steps = stepsTemplate.slice(0, Math.min(stepsTemplate.length, daysAvailable + 1)).map((template, index) => ({
    date: toISO(addDays(start, index)),
    title: template[0],
    duration: template[1],
    description: template[2],
  }));

  return { startDate: toISO(start), steps };
}

function inferTopics(item) {
  const profile = analyzeAcademicContent(item);
  return [...profile.majorTopics, ...profile.minorTopics].slice(0, 10);
}

function analyzeAcademicContent(item) {
  const source = `${item.title}\n${item.className}\n${item.notes || ""}\n${item.extractedText || ""}`;
  const lines = source
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headingTopics = lines
    .filter((line) => line.length <= 80 && /[:\-]/.test(line))
    .map((line) => line.split(/[:\-]/)[0].trim())
    .filter((text) => text.length > 3);

  const tokens = source
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 4 && !COMMON_WORDS.has(word));

  const frequency = new Map();
  for (const token of tokens) {
    frequency.set(token, (frequency.get(token) || 0) + 1);
  }

  const frequent = [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => titleCase(word));

  const merged = [...headingTopics, ...frequent];
  const unique = [];
  const seen = new Set();
  for (const topic of merged) {
    const key = topic.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(topic);
    }
  }

  const topics = unique.length ? unique : ["Core Concepts", "Lecture Notes", "Practice Problems"];
  const majorTopics = topics.slice(0, Math.max(2, Math.ceil(topics.length * 0.4)));
  const minorTopics = topics.slice(majorTopics.length, 10);
  const topicWeights = {};
  topics.forEach((topic, index) => {
    topicWeights[topic.toLowerCase()] = index < majorTopics.length ? 1.25 : 1;
  });
  return {
    topics,
    majorTopics,
    minorTopics,
    topicWeights,
    scopeScore: Math.min(10, Math.floor(tokens.length / 120) + majorTopics.length),
  };
}

function generatePracticeQuestions(item, profile = analyzeAcademicContent(item)) {
  if (item.type !== "exam") return [];
  return profile.topics.slice(0, 6).flatMap((topic) => [
    {
      question: `Concept check: Define ${topic} in your own words.`,
      answer: `${topic} is a core concept; explain definition, why it matters, and one course-specific example.`,
    },
    {
      question: `Application: Solve one example problem that uses ${topic}.`,
      answer: `Set up the problem, solve step-by-step, and check units/assumptions at the end.`,
    },
    {
      question: `Active recall: What mistake do students commonly make with ${topic}, and how can you avoid it?`,
      answer: `List one common error and create a quick checkpoint you can use before submitting answers.`,
    },
  ]);
}

function generateSummaryNotes(item, profile = analyzeAcademicContent(item)) {
  const big = profile.majorTopics.join(", ") || "core class concepts";
  const supporting = profile.minorTopics.slice(0, 4).join(", ") || "supporting ideas";
  return `Focus first on ${big}. Use notes/materials to connect them with ${supporting}. End each session with recall questions and a quick recap paragraph.`;
}

function generateDeliverables(item) {
  if (item.type === "exam") {
    return ["Complete all planned study blocks", "Finish at least two mixed practice sets", "Write a one-page final review sheet"];
  }
  if (item.type === "project") {
    return ["Requirements clarified", "Draft completed", "Revision pass complete", "Final files submitted"];
  }
  return ["Prompt fully understood", "Outline/draft complete", "Final edit done", "Submission checklist verified"];
}

function computeNextAction(item) {
  const upcoming = (item.calendarEvents || [])
    .filter((event) => daysUntil(event.date) >= 0)
    .sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`))[0];
  if (upcoming) {
    return {
      title: `${upcoming.title} — ${estimateEventDuration(upcoming.title, item)} min`,
      description: `${formatDate(upcoming.date)} • ${titleCase(item.type)} • ${titleCase(item.priority)} priority`,
      date: upcoming.date,
    };
  }
  return { title: `Review ${item.title}`, description: "No upcoming sessions; do a 30-minute checkpoint.", date: toISO(new Date()) };
}

function computeGlobalNextAction(items) {
  return items
    .map((item) => item.nextAction || computeNextAction(item))
    .sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`))[0] || null;
}

function computeProgress(item) {
  const total = (item.deliverables || []).length || (item.calendarEvents || []).length || 1;
  const completed = (item.progress?.completedSessions || []).filter(Boolean);
  const percent = Math.min(100, Math.round((completed.length / total) * 100));
  const readiness = item.type === "exam" ? (percent > 70 ? "High" : percent > 35 ? "Medium" : "Low") : percent > 60 ? "On Track" : "In Progress";
  return { completedSessions: completed, percent, readiness };
}

function buildRiskWarnings(item) {
  const warnings = [];
  const daysLeft = daysUntil(item.dueDate);
  const remainingBlocks = Math.max(1, (item.calendarEvents || []).length - item.progress.completedSessions.length);
  if (daysLeft < 0) warnings.push("This item is overdue. Prioritize immediate completion.");
  if (daysLeft <= 2 && item.progress.percent < 70) warnings.push("Due soon with limited completion. Focus on highest-impact tasks now.");
  if (remainingBlocks > Math.max(1, daysLeft + 1)) warnings.push("At current pace, you may not finish before due date.");
  if (item.type === "exam" && item.academicProfile?.majorTopics?.length > daysLeft + 1) warnings.push("Exam has many major topics left for remaining time.");
  if (!warnings.length) warnings.push("On track. Keep steady progress.");
  return warnings;
}

function computeWorkloadInsights(items) {
  const events = allCalendarEvents().filter((event) => daysUntil(event.date) >= 0 && daysUntil(event.date) <= 7);
  const deadlines = items.filter((item) => daysUntil(item.dueDate) >= 0 && daysUntil(item.dueDate) <= 5).length;
  const totalMinutes = events.reduce((acc, event) => acc + estimateEventDuration(event.title, items.find((i) => i.id === event.itemId)), 0);
  const hrsPerDay = totalMinutes / 60 / 7;
  const overloaded = hrsPerDay > 3.5 || deadlines >= 4;
  return {
    overloaded,
    message: `You have ${deadlines} deadline(s) in the next 5 days. Recommended workload: ${hrsPerDay.toFixed(1)} hrs/day.${overloaded ? " You are overloaded—move one block earlier." : " Pace is manageable."}`,
  };
}

function buildDailySchedule(items, dateISO) {
  return allCalendarEvents()
    .filter((event) => event.date === dateISO)
    .map((event) => ({
      itemId: event.itemId,
      title: event.title,
      duration: `${estimateEventDuration(event.title, items.find((i) => i.id === event.itemId))} min`,
      label: event.label,
    }));
}

function buildWeekSchedule(items) {
  const week = [];
  for (let i = 0; i < 7; i += 1) {
    const day = addDays(new Date(), i);
    const iso = toISO(day);
    const blocks = buildDailySchedule(items, iso);
    week.push({
      date: iso,
      dayLabel: day.toLocaleDateString(undefined, { weekday: "long" }),
      blocks,
      totalHours: blocks.reduce((acc, block) => acc + Number(block.duration.replace(" min", "")) / 60, 0),
    });
  }
  return week;
}

function estimateEventDuration(title, item) {
  const match = String(title).match(/(\d+)\s*min/i);
  if (match) return Number(match[1]);
  const baseline = item?.difficulty === "hard" ? 75 : item?.difficulty === "easy" ? 35 : 50;
  return baseline;
}

function urgencyLabel(item) {
  const days = daysUntil(item.dueDate);
  if (days < 0) return "Behind";
  if (days <= 1) return "Due soon";
  if (item.progress.percent < 25 && days <= 4) return "Start now";
  if (item.progress.percent >= 70) return "On track";
  return "Review today";
}

function toggleProgressSession(itemId, label, checked) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;
  const set = new Set(item.progress.completedSessions || []);
  if (checked) set.add(label);
  else set.delete(label);
  item.progress.completedSessions = [...set];
  const refreshed = enrichItem(item);
  setItems(state.items.map((entry) => (entry.id === itemId ? refreshed : entry)));
  openDetailModal(itemId);
}

function rescheduleSession(itemId, title, shiftDays = 1) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;
  let moved = false;
  if (item.type === "exam") {
    item.generatedPlan.studyDays = item.generatedPlan.studyDays.map((day) => {
      if (!moved && day.topic === title) {
        moved = true;
        return { ...day, date: toISO(addDays(new Date(`${day.date}T00:00:00`), shiftDays)) };
      }
      return day;
    });
  } else {
    item.generatedPlan.steps = item.generatedPlan.steps.map((step) => {
      if (!moved && step.title === title) {
        moved = true;
        return { ...step, date: toISO(addDays(new Date(`${step.date}T00:00:00`), shiftDays)) };
      }
      return step;
    });
  }
  const refreshed = enrichItem(item);
  setItems(state.items.map((entry) => (entry.id === itemId ? refreshed : entry)));
  render();
}

function openFocusMode(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;
  const action = item.nextAction || computeNextAction(item);
  modal.innerHTML = `<div class="modal-head"><h2>Focus Mode: ${escapeHtml(item.title)}</h2><button id="close-modal" class="btn btn-ghost">Close</button></div>
  <p class="warm-note">${escapeHtml(action.title)}</p>
  <p>${escapeHtml(action.description)}</p>
  <div class="timer" id="focus-timer">25:00</div>
  <div class="action-row"><button class="btn btn-primary" id="start-timer">Start</button><button class="btn btn-ghost" id="reset-timer">Reset</button></div>`;
  modal.showModal();
  document.getElementById("close-modal").addEventListener("click", closeModal);
  let seconds = 25 * 60;
  let timer = null;
  const tick = () => {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    document.getElementById("focus-timer").textContent = `${m}:${s}`;
  };
  tick();
  document.getElementById("start-timer").addEventListener("click", () => {
    if (timer) return;
    timer = setInterval(() => {
      seconds -= 1;
      tick();
      if (seconds <= 0) {
        clearInterval(timer);
        timer = null;
      }
    }, 1000);
  });
  document.getElementById("reset-timer").addEventListener("click", () => {
    seconds = 25 * 60;
    tick();
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  });
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) throw new Error("PDF.js is not loaded.");
  const bytes = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
  let text = "";
  for (let page = 1; page <= pdf.numPages; page += 1) {
    const pdfPage = await pdf.getPage(page);
    const content = await pdfPage.getTextContent();
    const pageText = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    text += `\n[Page ${page}] ${pageText}`;
  }
  return text.trim();
}

function sortedByDueDate(items) {
  return [...items].sort((a, b) => new Date(`${a.dueDate}T00:00:00`) - new Date(`${b.dueDate}T00:00:00`));
}

function daysUntil(isoDate) {
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(`${isoDate}T00:00:00`);
  return Math.floor((target - startToday) / 86400000);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDate(isoDate) {
  if (!isoDate) return "No date";
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function toISO(date) {
  return date.toISOString().slice(0, 10);
}

function getExt(name) {
  return String(name).toLowerCase().split(".").pop();
}

function titleCase(value) {
  return String(value)
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
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
  "notes",
  "review",
]);
