const STORAGE_KEY = "studyflow_v3";
const app = document.getElementById("app");
const topNav = document.getElementById("top-nav");
const modal = document.getElementById("item-modal");

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.js";
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
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeItem) : [];
  } catch (error) {
    console.error("Could not load StudyFlow data", error);
    return [];
  }
}

function normalizeItem(item) {
  const type = (item.type || "assignment").toLowerCase();
  return {
    id: item.id || crypto.randomUUID(),
    title: item.title || "Untitled",
    className: item.className || "Unassigned",
    professor: item.professor || "",
    type,
    dueDate: item.dueDate || toISO(addDays(new Date(), 7)),
    priority: (item.priority || "medium").toLowerCase(),
    difficulty: (item.difficulty || "medium").toLowerCase(),
    estimatedHours: Math.max(1, Number(item.estimatedHours || 6)),
    notes: item.notes || "",
    uploadedFiles: Array.isArray(item.uploadedFiles) ? item.uploadedFiles : [],
    extractedText: item.extractedText || "",
    examInputs: {
      topicsText: item.examInputs?.topicsText || "",
      topicDifficulty: item.examInputs?.topicDifficulty || {},
      homeworkQuestions: item.examInputs?.homeworkQuestions || "",
      classQuestions: item.examInputs?.classQuestions || "",
      weakAreas: item.examInputs?.weakAreas || "",
      reviewQuestions: item.examInputs?.reviewQuestions || "",
    },
    vocabTerms: Array.isArray(item.vocabTerms) ? item.vocabTerms : [],
    generatedPlan: item.generatedPlan || defaultPlan(type),
    calendarEvents: Array.isArray(item.calendarEvents) ? item.calendarEvents : [],
    academicProfile: item.academicProfile || null,
    practiceQuestions: Array.isArray(item.practiceQuestions) ? item.practiceQuestions : [],
    summaryNotes: item.summaryNotes || "",
    deliverables: Array.isArray(item.deliverables) ? item.deliverables : [],
    flashcards: item.flashcards || { cards: [], index: 0, flipped: false },
    quiz: item.quiz || { questions: [], answers: {}, history: [] },
    progress: item.progress || defaultProgress(),
    warnings: Array.isArray(item.warnings) ? item.warnings : [],
    nextAction: item.nextAction || null,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function defaultProgress() {
  return {
    completedSessions: [],
    topicConfidence: {},
    flashcardMastered: [],
    quizScore: null,
    percent: 0,
    readiness: "Low",
  };
}

function defaultPlan(type) {
  if (type === "exam") return { startDate: "", studyDays: [] };
  return { startDate: "", steps: [] };
}

function persistItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}

function setItems(nextItems) {
  const seen = new Set();
  const normalized = [];
  for (const raw of nextItems) {
    const item = enrichItem(normalizeItem(raw));
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    normalized.push(item);
  }
  state.items = normalized;
  persistItems();
}

function enrichItem(item) {
  const profile = analyzeAcademicContent(item);
  const generatedPlan = generatePlan(item, profile);
  const calendarEvents = buildCalendarEvents(item, generatedPlan);
  const practiceQuestions = generatePracticeQuestions(item, profile);
  const flashcards = generateFlashcards(item, profile);
  const quiz = generateQuiz(item, flashcards.cards, profile);

  const enriched = {
    ...item,
    academicProfile: profile,
    generatedPlan,
    calendarEvents,
    practiceQuestions,
    summaryNotes: generateSummaryNotes(item, profile),
    deliverables: generateDeliverables(item),
    flashcards: {
      cards: flashcards.cards,
      index: Math.min(item.flashcards?.index || 0, Math.max(0, flashcards.cards.length - 1)),
      flipped: false,
    },
    quiz: {
      questions: quiz.questions,
      answers: item.quiz?.answers || {},
      history: item.quiz?.history || [],
    },
  };

  enriched.progress = computeProgress(enriched);
  enriched.warnings = buildRiskWarnings(enriched);
  enriched.nextAction = computeNextAction(enriched);
  return enriched;
}

function render() {
  renderTopNav();
  if (state.activeView === "dashboard") renderDashboard();
  if (state.activeView === "add") renderAddForm();
  if (state.activeView === "calendar") renderCalendar();
  if (state.activeView === "classes") renderClasses();
  if (state.activeView === "study") renderStudyTools();
}

function renderTopNav() {
  const tabs = [
    ["dashboard", "Dashboard"],
    ["calendar", "Calendar"],
    ["classes", "Classes"],
    ["study", "Study Tools"],
  ];

  topNav.innerHTML = tabs
    .map(([key, label]) => {
      const classes = ["btn", state.activeView === key ? "tab-active" : "btn-ghost"]
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
  const allEvents = allCalendarEvents();
  const nextSessions = allEvents
    .filter((event) => event.colorClass === "session" && daysUntil(event.date) >= 0)
    .sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`));

  const stats = [
    ["Upcoming Exams", items.filter((item) => item.type === "exam" && daysUntil(item.dueDate) >= 0).length],
    ["Upcoming Assignments", items.filter((item) => item.type === "assignment" && daysUntil(item.dueDate) >= 0).length],
    ["Due This Week", items.filter((item) => daysUntil(item.dueDate) >= 0 && daysUntil(item.dueDate) <= 7).length],
  ];

  document.getElementById("stats-grid").innerHTML = stats
    .map(([label, value]) => `<article class="metric-chip"><h4>${label}</h4><p>${value}</p></article>`)
    .join("");

  document.getElementById("upcoming-list").innerHTML = renderItemRows(upcoming, "No upcoming deadlines yet.");
  document.getElementById("priority-list").innerHTML = renderItemRows(highPriority, "No high-priority items yet.");
  document.getElementById("recent-uploads").innerHTML = renderRecentUploadRows(recentUploads);

  const nextAction = computeGlobalNextAction(items);
  document.getElementById("next-action-panel").innerHTML = nextAction
    ? `<article class="banner-ok"><strong>${escapeHtml(nextAction.title)}</strong><p>${escapeHtml(nextAction.description)}</p></article>`
    : `<p class="muted">No tasks yet. Add your first exam, assignment, or project to generate a plan.</p>`;

  document.getElementById("next-study-block").innerHTML = renderEventRows(nextSessions.slice(0, 3), "No generated sessions yet.");

  const today = toISO(new Date());
  const todayPlan = buildDailySchedule(state.items, today);
  const weekPlan = buildWeekSchedule(state.items);
  document.getElementById("today-plan").innerHTML = todayPlan.length
    ? todayPlan
        .map((entry) => `<article class="item-row" data-item-id="${entry.itemId}"><div><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.duration)} • ${escapeHtml(entry.label)}</small></div><span class="chevron">›</span></article>`)
        .join("")
    : `<p class="muted">No study sessions scheduled yet. Upload a study guide or add an exam to get started.</p>`;

  document.getElementById("week-plan").innerHTML = weekPlan.length
    ? weekPlan.map((day) => `<article><strong>${escapeHtml(day.dayLabel)}</strong> — ${day.blocks.length} block(s), ${day.totalHours.toFixed(1)} hrs</article>`).join("")
    : `<p class="muted">No schedule generated this week.</p>`;

  const workload = computeWorkloadInsights(state.items);
  const overdue = items.filter((item) => daysUntil(item.dueDate) < 0);
  const riskRows = [
    `<p class="${workload.overloaded ? "banner-warning" : "banner-ok"}">${escapeHtml(workload.message)}</p>`,
    ...overdue.map((item) => `<p class="banner-warning">Overdue: ${escapeHtml(item.title)} (${escapeHtml(item.className)})</p>`),
    ...items.flatMap((item) => (item.warnings || []).slice(0, 1).map((w) => `<p>${escapeHtml(item.title)}: ${escapeHtml(w)}</p>`)),
  ];
  document.getElementById("dashboard-alerts").innerHTML = riskRows.join("") || `<p class="muted">Your calendar will fill automatically once you create a plan.</p>`;

  app.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeView = button.dataset.nav;
      render();
    });
  });


  const nextActionItem = nextAction ? state.items.find((item) => item.id === nextAction.itemId) : null;
  const openNext = app.querySelector('[data-next-open]');
  if (openNext) {
    openNext.disabled = !nextActionItem;
    openNext.addEventListener('click', () => {
      if (nextActionItem) openDetailModal(nextActionItem.id);
    });
  }
  bindItemClicks();
  bindEventClicks();
}

function renderRecentUploadRows(uploads) {
  if (!uploads.length) return `<p class="muted">No uploads yet. Add TXT/PDF materials.</p>`;
  return uploads
    .map(
      (upload) => `<article class="item-row" data-item-id="${upload.itemId}"><div><strong>${escapeHtml(upload.fileName)}</strong><small>${escapeHtml(upload.itemTitle)} • ${formatDate(upload.uploadedAt.slice(0, 10))}</small></div><span class="chevron">›</span></article>`
    )
    .join("");
}

function renderAddForm(prefillItem = null) {
  app.innerHTML = "";
  app.appendChild(document.getElementById("add-view").content.cloneNode(true));

  const form = document.getElementById("add-form");
  const fileInput = document.getElementById("add-files");
  const status = document.getElementById("add-upload-status");
  const uploadList = document.getElementById("add-upload-list");
  const resetBtn = document.getElementById("reset-add");

  state.pendingFiles = prefillItem ? [...prefillItem.uploadedFiles] : [];

  if (prefillItem) {
    form.title.value = prefillItem.title;
    form.className.value = prefillItem.className;
    form.professor.value = prefillItem.professor;
    form.type.value = prefillItem.type;
    form.dueDate.value = prefillItem.dueDate;
    form.priority.value = prefillItem.priority;
    form.difficulty.value = prefillItem.difficulty;
    form.estimatedHours.value = prefillItem.estimatedHours;
    form.notes.value = prefillItem.notes;
    form.examTopics.value = prefillItem.examInputs.topicsText;
    form.topicDifficulty.value = Object.entries(prefillItem.examInputs.topicDifficulty || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    form.homeworkQuestions.value = prefillItem.examInputs.homeworkQuestions;
    form.classQuestions.value = [prefillItem.examInputs.classQuestions, prefillItem.examInputs.reviewQuestions].filter(Boolean).join("\n");
    form.weakAreas.value = prefillItem.examInputs.weakAreas;
    form.vocabTerms.value = prefillItem.vocabTerms.map((v) => `${v.term} - ${v.definition}`).join("\n");
  }

  drawPendingFiles(uploadList);

  fileInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    status.textContent = "Reading files...";
    for (const file of files) {
      const ext = getExt(file.name);
      if (!["pdf", "txt"].includes(ext)) continue;

      let text = "";
      let extractionError = "";
      if (ext === "txt") {
        text = await file.text();
      } else {
        try {
          text = await extractPdfText(file);
        } catch (error) {
          extractionError = "Could not parse this PDF text. You can still save the item.";
          console.error("PDF parse error", error);
        }
      }

      state.pendingFiles.push({
        id: crypto.randomUUID(),
        fileName: file.name,
        fileType: ext,
        text,
        uploadedAt: new Date().toISOString(),
        extractionError,
      });
    }

    drawPendingFiles(uploadList);
    status.textContent = `${state.pendingFiles.length} file(s) attached.`;
    fileInput.value = "";
  });

  resetBtn.addEventListener("click", () => renderAddForm(prefillItem));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (!data.title.trim() || !data.className.trim() || !data.dueDate) {
      status.textContent = "Title, class name, and date are required.";
      return;
    }

    const vocabTerms = parseVocabLines(data.vocabTerms || "");
    const topicDifficulty = parseTopicDifficulty(data.topicDifficulty || "");

    const item = {
      id: prefillItem ? prefillItem.id : crypto.randomUUID(),
      title: data.title.trim(),
      className: data.className.trim(),
      professor: (data.professor || "").trim(),
      type: data.type.toLowerCase(),
      dueDate: data.dueDate,
      priority: data.priority.toLowerCase(),
      difficulty: data.difficulty.toLowerCase(),
      estimatedHours: Math.max(1, Number(data.estimatedHours || 6)),
      notes: (data.notes || "").trim(),
      uploadedFiles: state.pendingFiles,
      extractedText: state.pendingFiles.map((f) => f.text || "").join("\n\n").trim(),
      examInputs: {
        topicsText: (data.examTopics || "").trim(),
        topicDifficulty,
        homeworkQuestions: (data.homeworkQuestions || "").trim(),
        classQuestions: (data.classQuestions || "").trim(),
        weakAreas: (data.weakAreas || "").trim(),
        reviewQuestions: (data.classQuestions || "").trim(),
      },
      vocabTerms,
      progress: prefillItem ? prefillItem.progress : defaultProgress(),
      createdAt: prefillItem ? prefillItem.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (prefillItem) {
      setItems(state.items.map((entry) => (entry.id === item.id ? item : entry)));
      closeModal();
    } else {
      setItems([...state.items, item]);
    }

    state.activeView = "dashboard";
    render();
  });
}

function drawPendingFiles(uploadList) {
  uploadList.innerHTML = state.pendingFiles.length
    ? state.pendingFiles
        .map(
          (file) => `<li>${escapeHtml(file.fileName)} (${file.fileType.toUpperCase()}) ${
            file.extractionError ? `<span class="priority high">${escapeHtml(file.extractionError)}</span>` : ""
          }</li>`
        )
        .join("")
    : "<li>No files added yet.</li>";
}

function renderCalendar() {
  app.innerHTML = "";
  app.appendChild(document.getElementById("calendar-view").content.cloneNode(true));

  const year = state.monthCursor.getFullYear();
  const month = state.monthCursor.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const events = allCalendarEvents();

  document.getElementById("calendar-title").textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  document.getElementById("calendar-weekdays").innerHTML = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div>${d}</div>`).join("");

  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(calendarCell(new Date(year, month, i - first.getDay() + 1), true, events));
  for (let day = 1; day <= last.getDate(); day += 1) cells.push(calendarCell(new Date(year, month, day), false, events));
  while (cells.length % 7 !== 0) cells.push(calendarCell(new Date(year, month + 1, cells.length - (first.getDay() + last.getDate()) + 1), true, events));

  document.getElementById("calendar-grid").innerHTML = cells.join("");

  const upcoming = events
    .filter((event) => daysUntil(event.date) >= 0)
    .sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`))
    .slice(0, 14);

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
  const dayEvents = events.filter((e) => e.date === iso).slice(0, 3);
  return `<article class="cal-cell ${outside ? "outside" : ""} ${state.selectedDateISO === iso ? "selected" : ""}" data-date="${iso}">
    <div class="cal-day">${date.getDate()}</div>
    ${dayEvents.map((e) => `<div class="cal-item ${e.colorClass}">${escapeHtml(e.title)}</div>`).join("")}
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

  const classNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
  const root = document.getElementById("classes-grouped");
  if (!classNames.length) {
    root.innerHTML = `<p class="muted">No classes yet. Add an item first.</p>`;
    return;
  }

  root.innerHTML = classNames
    .map((className) => {
      const rows = grouped[className]
        .sort((a, b) => new Date(`${a.dueDate}T00:00:00`) - new Date(`${b.dueDate}T00:00:00`))
        .map(
          (item) => `<article class="item-row" data-item-id="${item.id}"><div><strong>${escapeHtml(item.title)}</strong><small>${titleCase(item.type)} • ${formatDate(item.dueDate)} • <span class="priority ${item.priority}">${titleCase(item.priority)}</span></small></div><span class="chevron">›</span></article>`
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

  if (!state.items.length) {
    select.innerHTML = `<option value="">No items</option>`;
    empty.textContent = "Add items to use Study Tools.";
    return;
  }

  const items = sortedByDueDate(state.items);
  const selected = items.find((item) => item.id === state.selectedStudyItemId) || items[0];
  state.selectedStudyItemId = selected.id;

  select.innerHTML = items.map((item) => `<option value="${item.id}">${escapeHtml(item.title)} (${titleCase(item.type)})</option>`).join("");
  select.value = selected.id;

  const toolsByType = {
    exam: ["plan", "practice", "flashcards", "quiz", "review"],
    project: ["timeline", "milestones", "risks", "review"],
    assignment: ["breakdown", "checklist", "time", "review"],
  };
  const label = {
    plan: "Plan Mode",
    practice: "Practice Mode",
    flashcards: "Flashcard Mode",
    quiz: "Quiz Mode",
    review: "Review Mode",
    timeline: "Work Timeline",
    milestones: "Milestones",
    risks: "Risks / Blockers",
    breakdown: "Step Breakdown",
    checklist: "Checklist",
    time: "Time Estimate",
  };

  const tools = toolsByType[selected.type];
  if (!tools.includes(state.selectedTool)) state.selectedTool = tools[0];

  function draw() {
    buttons.innerHTML = tools
      .map((tool) => `<button class="btn btn-secondary ${state.selectedTool === tool ? "tool-btn-active" : ""}" data-tool="${tool}">${label[tool]}</button>`)
      .join("");

    output.innerHTML = buildStudyToolContent(selected, state.selectedTool);

    buttons.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedTool = btn.dataset.tool;
        draw();
      });
    });

    bindStudyOutputActions(selected.id);
  }

  draw();

  select.addEventListener("change", () => {
    state.selectedStudyItemId = select.value;
    state.selectedTool = null;
    renderStudyTools();
  });

  document.getElementById("study-open-detail").addEventListener("click", () => openDetailModal(state.selectedStudyItemId));
  empty.textContent = "";
}

function bindStudyOutputActions(itemId) {
  app.querySelectorAll("[data-flip-card]").forEach((btn) => btn.addEventListener("click", () => toggleCardFlip(itemId)));
  app.querySelectorAll("[data-card-next]").forEach((btn) => btn.addEventListener("click", () => moveFlashcard(itemId, 1)));
  app.querySelectorAll("[data-card-prev]").forEach((btn) => btn.addEventListener("click", () => moveFlashcard(itemId, -1)));
  app.querySelectorAll("[data-card-know]").forEach((btn) => btn.addEventListener("click", () => markFlashcard(itemId, "know")));
  app.querySelectorAll("[data-card-again]").forEach((btn) => btn.addEventListener("click", () => markFlashcard(itemId, "again")));
  app.querySelectorAll("[data-quiz-answer]").forEach((btn) => btn.addEventListener("click", () => answerQuiz(itemId, btn.dataset.quizAnswer, btn.dataset.quizValue)));
  app.querySelectorAll("[data-set-confidence]").forEach((btn) => btn.addEventListener("click", () => setTopicConfidence(itemId, btn.dataset.topic, btn.dataset.setConfidence)));
}

function buildStudyToolContent(item, tool) {
  if (item.type === "exam") {
    if (tool === "plan") return renderExamPlanCards(item);
    if (tool === "practice") return renderPracticeCards(item);
    if (tool === "flashcards") return renderFlashcardCarousel(item);
    if (tool === "quiz") return renderQuizCards(item);
    return renderReviewMode(item);
  }

  if (item.type === "project") {
    if (tool === "timeline") return renderProjectAssignmentTimeline(item);
    if (tool === "milestones") return renderMilestones(item);
    if (tool === "risks") return renderRisks(item);
    return renderReviewMode(item);
  }

  if (tool === "breakdown") return renderProjectAssignmentTimeline(item);
  if (tool === "checklist") return renderChecklist(item);
  if (tool === "time") return renderTimeEstimate(item);
  return renderReviewMode(item);
}

function renderExamPlanCards(item) {
  const days = item.generatedPlan.studyDays || [];
  if (!days.length) return `<p class="muted">No study plan generated yet.</p>`;
  return `
    <div class="panel"><strong>Start Date:</strong> ${formatDate(item.generatedPlan.startDate)} • <strong>Final Date:</strong> ${formatDate(item.dueDate)}</div>
    <div class="timeline-grid">
      ${days
        .map(
          (day, i) => `<article class="day-card">
          <h4>Day ${i + 1} • ${formatDate(day.date)}</h4>
          ${day.blocks.map((b) => `<div class="topic-block"><strong>${escapeHtml(b.title)}</strong><small>${escapeHtml(b.duration)} • ${escapeHtml(b.label)}</small><p>${escapeHtml(b.description)}</p></div>`).join("")}
        </article>`
        )
        .join("")}
    </div>`;
}

function renderPracticeCards(item) {
  if (!item.practiceQuestions.length) return `<p class="muted">No practice questions yet. Add homework or class questions in the form.</p>`;
  return item.practiceQuestions
    .map(
      (q, i) => `<article class="practice-card"><h4>${escapeHtml(q.group || "Practice")}</h4><p><strong>Q${i + 1}.</strong> ${escapeHtml(q.question)}</p><p class="muted">${escapeHtml(q.answer)}</p><div class="action-row">${["confident", "somewhat", "weak"].map((lvl) => `<button class="btn btn-ghost" data-set-confidence="${lvl}" data-topic="${escapeHtml(q.topic || "general")}">${titleCase(lvl)}</button>`).join("")}</div></article>`
    )
    .join("");
}

function renderFlashcardCarousel(item) {
  const cards = item.flashcards.cards;
  if (!cards.length) return `<p class="muted">No flashcards yet. Add vocab terms or materials.</p>`;
  const index = item.flashcards.index || 0;
  const current = cards[index];
  const masteredCount = item.progress.flashcardMastered.length;

  return `<div class="panel">Flashcards mastered: ${masteredCount}/${cards.length}</div>
    <article class="flashcard ${item.flashcards.flipped ? "flipped" : ""}">
      <div class="flashcard-face front"><strong>${escapeHtml(current.front)}</strong></div>
      <div class="flashcard-face back"><p>${escapeHtml(current.back)}</p></div>
    </article>
    <div class="action-row">
      <button class="btn btn-ghost" data-card-prev="1">Prev</button>
      <button class="btn btn-secondary" data-flip-card="1">Flip</button>
      <button class="btn btn-ghost" data-card-next="1">Next</button>
      <button class="btn btn-primary" data-card-know="1">Know it</button>
      <button class="btn btn-danger" data-card-again="1">Study again</button>
    </div>
    <div class="progress"><span style="width:${Math.round(((index + 1) / cards.length) * 100)}%;"></span></div>
    <p class="muted">Card ${index + 1} of ${cards.length}</p>`;
}

function renderQuizCards(item) {
  const questions = item.quiz.questions;
  if (!questions.length) return `<p class="muted">No quiz generated yet.</p>`;
  return questions
    .map((q, i) => {
      const answer = item.quiz.answers[q.id];
      return `<article class="quiz-card"><h4>${escapeHtml(q.type.toUpperCase())}</h4><p><strong>${i + 1}.</strong> ${escapeHtml(q.question)}</p>
      <div class="action-row">${q.options
        .map((opt) => `<button class="btn ${answer === opt ? "btn-primary" : "btn-ghost"}" data-quiz-answer="${q.id}" data-quiz-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`)
        .join("")}</div>
      ${answer ? `<p class="muted">Your answer: ${escapeHtml(answer)} • ${answer === q.correct ? "✅ Correct" : `Correct: ${escapeHtml(q.correct)}`}</p>` : ""}
      </article>`;
    })
    .join("");
}

function renderReviewMode(item) {
  return `<article class="panel"><h4>Summary Notes</h4><p>${escapeHtml(item.summaryNotes)}</p></article>
  <article class="panel"><h4>Warnings</h4>${(item.warnings || []).map((w) => `<p class="banner-warning">${escapeHtml(w)}</p>`).join("")}</article>
  <article class="panel"><h4>Progress</h4><div class="progress"><span style="width:${item.progress.percent}%;"></span></div><p>${item.progress.percent}% complete • Readiness: ${escapeHtml(item.progress.readiness)}</p></article>`;
}

function renderProjectAssignmentTimeline(item) {
  const steps = item.generatedPlan.steps || [];
  if (!steps.length) return `<p class="muted">No timeline steps yet.</p>`;
  return `<div class="timeline-grid">${steps
    .map(
      (step, idx) => `<article class="day-card"><h4>Step ${idx + 1} • ${formatDate(step.date)}</h4><div class="topic-block"><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.duration)}</small><p>${escapeHtml(step.description)}</p></div></article>`
    )
    .join("")}</div>`;
}

function renderMilestones(item) {
  const steps = item.generatedPlan.steps || [];
  return steps.length
    ? `<ul>${steps.map((s) => `<li><strong>${formatDate(s.date)}</strong> — ${escapeHtml(s.title)} (${escapeHtml(s.duration)})</li>`).join("")}</ul>`
    : `<p class="muted">No milestones available.</p>`;
}

function renderRisks(item) {
  return `<ul>${buildRiskWarnings(item).map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`;
}

function renderChecklist(item) {
  return `<ul>${item.deliverables.map((d) => `<li>☐ ${escapeHtml(d)}</li>`).join("")}</ul>`;
}

function renderTimeEstimate(item) {
  const total = item.estimatedHours;
  const blocks = item.calendarEvents.length;
  return `<p><strong>Estimated total:</strong> ${total} hours</p><p><strong>Planned blocks:</strong> ${blocks}</p><p><strong>Average per block:</strong> ${(total / Math.max(1, blocks)).toFixed(1)} hrs</p>`;
}

function openDetailModal(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;

  const tabs = {
    overview: () => `
      <div class="kv">
        <p><strong>Title:</strong> ${escapeHtml(item.title)}</p>
        <p><strong>Type:</strong> ${titleCase(item.type)}</p>
        <p><strong>Class:</strong> ${escapeHtml(item.className)}</p>
        <p><strong>Due Date:</strong> ${formatDate(item.dueDate)}</p>
        <p><strong>Priority:</strong> <span class="priority ${item.priority}">${titleCase(item.priority)}</span></p>
        <p><strong>Next Recommended Action:</strong> ${escapeHtml(item.nextAction?.title || "No action yet")}</p>
        <p><strong>Status:</strong> <span class="pill">${escapeHtml(urgencyLabel(item))}</span></p>
        <div class="progress"><span style="width:${item.progress.percent}%;"></span></div>
        <p>${item.progress.percent}% complete • Quiz score: ${item.progress.quizScore ?? "—"}% • Flashcards mastered: ${item.progress.flashcardMastered.length}</p>
      </div>`,
    plan: () => (item.type === "exam" ? renderExamPlanCards(item) : renderProjectAssignmentTimeline(item)),
    practice: () => (item.type === "exam" ? renderPracticeCards(item) : renderChecklist(item)),
    flashcards: () => (item.type === "exam" ? renderFlashcardCarousel(item) : `<p class="muted">Flashcards are exam-focused.</p>`),
    quiz: () => (item.type === "exam" ? renderQuizCards(item) : `<p class="muted">Quiz mode is exam-focused.</p>`),
    materials: () => `
      <p><strong>Uploaded files</strong></p>
      <ul class="file-list">${item.uploadedFiles.length ? item.uploadedFiles.map((f) => `<li>${escapeHtml(f.fileName)} (${f.fileType.toUpperCase()})</li>`).join("") : "<li>No files uploaded.</li>"}</ul>
      <p><strong>Extracted PDF/TXT Summary</strong></p>
      <p class="muted">${escapeHtml(item.summaryNotes)}</p>
      <p class="muted">${escapeHtml((item.extractedText || "No extracted text.").slice(0, 2200))}</p>`,
  };

  modal.innerHTML = `
    <div class="modal-head"><h2>${escapeHtml(item.title)}</h2><button id="close-modal" class="btn btn-ghost">Close</button></div>
    <div class="modal-tabs">
      <button class="btn btn-secondary tool-btn-active" data-tab="overview">Overview</button>
      <button class="btn btn-secondary" data-tab="plan">Study Plan</button>
      <button class="btn btn-secondary" data-tab="practice">Practice</button>
      <button class="btn btn-secondary" data-tab="flashcards">Flashcards</button>
      <button class="btn btn-secondary" data-tab="quiz">Quiz</button>
      <button class="btn btn-secondary" data-tab="materials">Materials</button>
    </div>
    <div id="modal-content" class="modal-content"></div>
    <div class="action-row" style="margin-top:.8rem">
      <button id="edit-item" class="btn btn-ghost">Edit</button>
      <button id="delete-item" class="btn btn-danger">Delete</button>
    </div>`;

  modal.showModal();
  setModalTab("overview");

  modal.querySelector("#close-modal").addEventListener("click", closeModal);
  modal.querySelectorAll("[data-tab]").forEach((btn) => btn.addEventListener("click", () => setModalTab(btn.dataset.tab)));
  modal.querySelector("#edit-item").addEventListener("click", () => {
    state.activeView = "add";
    closeModal();
    renderAddForm(item);
  });
  modal.querySelector("#delete-item").addEventListener("click", () => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setItems(state.items.filter((entry) => entry.id !== item.id));
    closeModal();
    if (state.selectedStudyItemId === item.id) state.selectedStudyItemId = null;
    render();
  });

  function setModalTab(tab) {
    modal.querySelectorAll("[data-tab]").forEach((btn) => btn.classList.toggle("tool-btn-active", btn.dataset.tab === tab));
    modal.querySelector("#modal-content").innerHTML = tabs[tab]();
    modal.querySelectorAll("[data-flip-card]").forEach((btn) => btn.addEventListener("click", () => toggleCardFlip(item.id, true)));
    modal.querySelectorAll("[data-card-next]").forEach((btn) => btn.addEventListener("click", () => moveFlashcard(item.id, 1, true)));
    modal.querySelectorAll("[data-card-prev]").forEach((btn) => btn.addEventListener("click", () => moveFlashcard(item.id, -1, true)));
    modal.querySelectorAll("[data-card-know]").forEach((btn) => btn.addEventListener("click", () => markFlashcard(item.id, "know", true)));
    modal.querySelectorAll("[data-card-again]").forEach((btn) => btn.addEventListener("click", () => markFlashcard(item.id, "again", true)));
    modal.querySelectorAll("[data-quiz-answer]").forEach((btn) => btn.addEventListener("click", () => answerQuiz(item.id, btn.dataset.quizAnswer, btn.dataset.quizValue, true)));
    modal.querySelectorAll("[data-set-confidence]").forEach((btn) => btn.addEventListener("click", () => setTopicConfidence(item.id, btn.dataset.topic, btn.dataset.setConfidence, true)));
  }
}

function closeModal() {
  if (modal.open) modal.close();
}

function toggleCardFlip(itemId, keepModal = false) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.flashcards.flipped = !item.flashcards.flipped;
  setItems(state.items.map((entry) => (entry.id === itemId ? item : entry)));
  if (keepModal) openDetailModal(itemId);
  else renderStudyTools();
}

function moveFlashcard(itemId, direction, keepModal = false) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item || !item.flashcards.cards.length) return;
  const total = item.flashcards.cards.length;
  item.flashcards.index = (item.flashcards.index + direction + total) % total;
  item.flashcards.flipped = false;
  setItems(state.items.map((entry) => (entry.id === itemId ? item : entry)));
  if (keepModal) openDetailModal(itemId);
  else renderStudyTools();
}

function markFlashcard(itemId, action, keepModal = false) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item || !item.flashcards.cards.length) return;
  const card = item.flashcards.cards[item.flashcards.index];
  const set = new Set(item.progress.flashcardMastered || []);
  if (action === "know") set.add(card.id);
  else set.delete(card.id);
  item.progress.flashcardMastered = [...set];
  setItems(state.items.map((entry) => (entry.id === itemId ? item : entry)));
  if (keepModal) openDetailModal(itemId);
  else renderStudyTools();
}

function answerQuiz(itemId, questionId, answer, keepModal = false) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.quiz.answers = { ...item.quiz.answers, [questionId]: answer };
  const questions = item.quiz.questions;
  const answered = Object.keys(item.quiz.answers).length;
  const correct = questions.filter((q) => item.quiz.answers[q.id] === q.correct).length;
  item.progress.quizScore = answered ? Math.round((correct / questions.length) * 100) : null;
  setItems(state.items.map((entry) => (entry.id === itemId ? item : entry)));
  if (keepModal) openDetailModal(itemId);
  else renderStudyTools();
}

function setTopicConfidence(itemId, topic, confidence, keepModal = false) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.progress.topicConfidence[topic.toLowerCase()] = confidence;
  setItems(state.items.map((entry) => (entry.id === itemId ? item : entry)));
  if (keepModal) openDetailModal(itemId);
  else renderStudyTools();
}

function renderItemRows(items, emptyMessage) {
  if (!items.length) return `<p class="muted">${emptyMessage}</p>`;
  return items
    .map((item) => `<article class="item-row" data-item-id="${item.id}"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.className)} • ${titleCase(item.type)} • ${formatDate(item.dueDate)}</small></div><span class="chevron">›</span></article>`)
    .join("");
}

function renderEventRows(events, emptyMessage) {
  if (!events.length) return `<p class="muted">${emptyMessage}</p>`;
  return events
    .map(
      (event) => `<article class="item-row" data-item-id="${event.itemId}"><div><strong>${escapeHtml(event.title)}</strong><small>${formatDate(event.date)} • ${escapeHtml(event.label)} • ${escapeHtml(event.parentTitle)}</small></div><div class="action-row"><span class="tag ${event.colorClass}">${titleCase(event.colorClass)}</span>${
        event.colorClass === "session" ? `<button class="btn btn-ghost" data-reschedule="${event.itemId}" data-event-id="${event.id}">Move +1d</button>` : ""
      }</div></article>`
    )
    .join("");
}

function bindItemClicks() {
  app.querySelectorAll("[data-item-id]").forEach((el) => el.addEventListener("click", () => openDetailModal(el.dataset.itemId)));
}

function bindEventClicks() {
  app.querySelectorAll("[data-item-id]").forEach((el) => el.addEventListener("click", () => openDetailModal(el.dataset.itemId)));
  app.querySelectorAll("[data-reschedule]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      rescheduleSession(btn.dataset.reschedule, btn.dataset.eventId);
    });
  });
}

function rescheduleSession(itemId, eventId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.calendarEvents = item.calendarEvents.map((ev) => (ev.id === eventId ? { ...ev, date: toISO(addDays(new Date(`${ev.date}T00:00:00`), 1)) } : ev));
  if (item.type === "exam") {
    item.generatedPlan.studyDays = item.generatedPlan.studyDays.map((day) => ({
      ...day,
      blocks: day.blocks.map((block) => {
        const match = item.calendarEvents.find((ev) => ev.title === block.title && ev.date !== day.date);
        return match ? { ...block, date: match.date } : block;
      }),
    }));
  } else {
    item.generatedPlan.steps = item.generatedPlan.steps.map((step) => {
      const match = item.calendarEvents.find((ev) => ev.title === step.title);
      return match ? { ...step, date: match.date } : step;
    });
  }
  setItems(state.items.map((entry) => (entry.id === itemId ? item : entry)));
  render();
}

function collectRecentUploads() {
  return state.items
    .flatMap((item) => item.uploadedFiles.map((file) => ({ itemId: item.id, itemTitle: item.title, fileName: file.fileName, uploadedAt: file.uploadedAt || item.updatedAt })))
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

function allCalendarEvents() {
  return state.items.flatMap((item) => {
    const due = {
      id: `${item.id}-due`,
      itemId: item.id,
      parentTitle: item.title,
      title: `${item.title} (Due)`,
      date: item.dueDate,
      label: `${titleCase(item.type)} due`,
      colorClass: item.type,
    };
    return [due, ...item.calendarEvents.map((e) => ({ ...e, itemId: item.id, parentTitle: item.title }))];
  });
}

function buildCalendarEvents(item, generatedPlan) {
  if (item.type === "exam") {
    return (generatedPlan.studyDays || []).flatMap((day) =>
      day.blocks.map((block) => ({
        id: crypto.randomUUID(),
        title: block.title,
        date: day.date,
        label: block.label,
        colorClass: "session",
      }))
    );
  }

  return (generatedPlan.steps || []).map((step) => ({
    id: crypto.randomUUID(),
    title: step.title,
    date: step.date,
    label: item.type === "project" ? "Project phase" : "Assignment step",
    colorClass: "session",
  }));
}

function generatePlan(item, profile) {
  if (item.type === "exam") return generateExamPlan(item, profile);
  if (item.type === "project") return generateProjectPlan(item, profile);
  return generateAssignmentPlan(item, profile);
}

function generateExamPlan(item, profile) {
  const due = new Date(`${item.dueDate}T00:00:00`);
  const daysLeft = Math.max(2, daysUntil(item.dueDate));
  const totalDays = Math.max(3, Math.min(14, daysLeft));

  const topics = profile.topics.slice(0, 10);
  const weights = profile.topicWeights;
  const weakMap = topicConfidenceWeights(item.progress.topicConfidence, topics);
  const minutesBudget = Math.max(120, Math.round(item.estimatedHours * 60));

  const topicPool = topics.map((topic) => {
    const base = weights[topic.toLowerCase()] || 1;
    const difficultyBoost = difficultyToWeight(item.examInputs.topicDifficulty[topic.toLowerCase()] || item.difficulty);
    const weakBoost = weakMap[topic.toLowerCase()] || 1;
    return { topic, score: base * difficultyBoost * weakBoost };
  });

  const sumScore = topicPool.reduce((acc, t) => acc + t.score, 0) || 1;
  const startDate = addDays(due, -(totalDays + 1));

  const studyDays = [];
  for (let i = 0; i < totalDays; i += 1) {
    const date = toISO(addDays(startDate, i));
    const isFinal = i === totalDays - 1;
    const isPracticeDay = i % 3 === 2;
    const isReviewDay = i % 4 === 3 && !isFinal;

    const dayMinutes = Math.max(45, Math.round(minutesBudget / totalDays));
    const primary = topicPool[i % topicPool.length] || { topic: "Core Concepts", score: 1 };
    const secondary = topicPool[(i + 1) % topicPool.length] || primary;

    const p1 = Math.round((dayMinutes * (primary.score / sumScore)) * topicPool.length);
    const p2 = Math.round((dayMinutes * (secondary.score / sumScore)) * topicPool.length * 0.7);

    const blocks = [];
    if (isFinal) {
      blocks.push({ title: "Final review + weak-area pass", duration: "90 min", label: "Final review", description: "Run a full recap, mistakes list, and confidence check." });
    } else if (isReviewDay) {
      blocks.push({ title: `Review ${primary.topic}`, duration: `${Math.max(35, p1)} min`, label: "Review", description: "Revisit earlier topic with active recall." });
      blocks.push({ title: `Review ${secondary.topic}`, duration: `${Math.max(30, p2)} min`, label: "Review", description: "Spaced repetition for retention." });
    } else {
      blocks.push({ title: `Study ${primary.topic}`, duration: `${Math.max(40, p1)} min`, label: "Topic focus", description: `Build concept clarity and examples for ${primary.topic}.` });
      blocks.push({ title: `Study ${secondary.topic}`, duration: `${Math.max(30, p2)} min`, label: "Topic focus", description: `Follow-up with mixed understanding checks.` });
      if (isPracticeDay) {
        blocks.push({ title: `Practice set: ${primary.topic}`, duration: "45 min", label: "Practice", description: "Solve homework/class problems and log mistakes." });
      }
    }

    studyDays.push({ date, blocks });
  }

  return { startDate: toISO(startDate), studyDays };
}

function generateProjectPlan(item, profile) {
  const due = new Date(`${item.dueDate}T00:00:00`);
  const scope = Math.max(1, profile.scopeScore);
  const daysLeft = Math.max(5, daysUntil(item.dueDate));
  const leadDays = Math.min(daysLeft - 1, Math.max(5, Math.round(scope + item.estimatedHours / 2)));
  const start = addDays(due, -leadDays);

  const phases = [
    ["Research + Requirements", 0.2, "Review scope, deliverables, and constraints."],
    ["Outline + Architecture", 0.2, "Design approach and plan implementation structure."],
    ["Execution Build", 0.35, "Implement core work and gather outputs."],
    ["Milestone Review", 0.15, "Validate milestone quality and address blockers."],
    ["Polish + Final Submission", 0.1, "Final QA, edits, and submission checklist."],
  ];

  let cursor = new Date(start);
  const steps = phases.map(([title, ratio, description], index) => {
    const days = Math.max(1, Math.round(leadDays * ratio));
    const duration = `${Math.max(1, (item.estimatedHours * ratio).toFixed(1))} hrs`;
    const step = { date: toISO(cursor), title, duration, description };
    cursor = addDays(cursor, index === phases.length - 1 ? 0 : days);
    return step;
  });

  return { startDate: toISO(start), steps };
}

function generateAssignmentPlan(item, profile) {
  const due = new Date(`${item.dueDate}T00:00:00`);
  const daysLeft = Math.max(3, daysUntil(item.dueDate));
  const start = addDays(due, -Math.max(3, Math.min(daysLeft - 1, Math.round(item.estimatedHours / 2) + 2)));

  const stepsTemplate = [
    ["Understand the prompt", 0.15, "Read instructions, highlight deliverables, and define success criteria."],
    ["Gather info/material", 0.2, "Collect class notes, sources, and examples required for completion."],
    ["Build first draft", 0.35, "Complete the main body or first full attempt."],
    ["Complete and refine", 0.2, "Finish remaining parts and improve clarity/accuracy."],
    ["Review + submission prep", 0.1, "Proofread, run checklist, and submit with confidence."],
  ];

  const steps = stepsTemplate.map(([title, ratio, description], index) => ({
    date: toISO(addDays(start, index)),
    title,
    duration: `${Math.max(20, Math.round(item.estimatedHours * ratio * 60))} min`,
    description,
  }));

  return { startDate: toISO(start), steps };
}

function analyzeAcademicContent(item) {
  const manualTopics = parseTopicList(item.examInputs.topicsText || "");
  const weakAreas = parseTopicList(item.examInputs.weakAreas || "");
  const source = `${item.title}\n${item.className}\n${item.notes}\n${item.extractedText}`;

  const words = source
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !COMMON_WORDS.has(w));

  const freq = new Map();
  for (const word of words) freq.set(word, (freq.get(word) || 0) + 1);

  const inferred = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => titleCase(word));

  const merged = uniqueCaseInsensitive([...manualTopics, ...weakAreas, ...inferred]);
  const topics = merged.length ? merged : ["Core Concepts", "Practice Problems", "Review Topics"];
  const majorTopics = topics.slice(0, Math.max(2, Math.ceil(topics.length * 0.45)));
  const minorTopics = topics.slice(majorTopics.length);

  const topicWeights = {};
  topics.forEach((topic) => {
    const key = topic.toLowerCase();
    const frequencyBoost = Math.min(1.8, 1 + ((freq.get(key) || 0) / 6));
    const manualDifficulty = item.examInputs.topicDifficulty[key] || item.difficulty;
    const diffBoost = difficultyToWeight(manualDifficulty);
    const weakBoost = weakAreas.some((w) => key.includes(w.toLowerCase()) || w.toLowerCase().includes(key)) ? 1.4 : 1;
    topicWeights[key] = Number((frequencyBoost * diffBoost * weakBoost).toFixed(2));
  });

  return {
    topics,
    majorTopics,
    minorTopics,
    topicWeights,
    scopeScore: Math.min(10, Math.max(1, Math.round(words.length / 160) + majorTopics.length)),
  };
}

function generatePracticeQuestions(item, profile) {
  if (item.type !== "exam") return [];
  const sources = [item.examInputs.homeworkQuestions, item.examInputs.classQuestions, item.examInputs.reviewQuestions]
    .filter(Boolean)
    .join("\n");
  const sourceQuestions = parseQuestionLines(sources);

  const topicQuestions = profile.topics.slice(0, 6).flatMap((topic) => [
    {
      group: topic,
      topic,
      question: `Explain ${topic} in your own words and give one class example.`,
      answer: `Define ${topic}, connect it to class material, and include one worked example.`,
    },
    {
      group: `${topic} - Active Recall`,
      topic,
      question: `What mistake is common in ${topic}, and how will you avoid it?`,
      answer: `List one common error and a correction check you can use while solving.`,
    },
  ]);

  const fromHomework = sourceQuestions.slice(0, 8).map((q, idx) => ({
    group: `Homework/Class Set ${Math.floor(idx / 2) + 1}`,
    topic: detectTopicForQuestion(q, profile.topics),
    question: q,
    answer: "Work step-by-step, then compare your result to notes and explain the reasoning.",
  }));

  return [...fromHomework, ...topicQuestions].slice(0, 16);
}

function generateFlashcards(item, profile) {
  const cards = [];
  const vocab = item.vocabTerms || [];
  vocab.forEach((term) => {
    cards.push({ id: crypto.randomUUID(), front: term.term, back: term.definition || "Explain this term in your own words." });
  });

  if (!cards.length) {
    profile.topics.slice(0, 12).forEach((topic) => {
      cards.push({
        id: crypto.randomUUID(),
        front: topic,
        back: `Definition + one example + one mistake to avoid for ${topic}.`,
      });
    });
  }

  return { cards };
}

function generateQuiz(item, cards, profile) {
  if (item.type !== "exam") return { questions: [] };
  const questions = [];
  const topicPool = profile.topics.slice(0, 8);

  cards.slice(0, 5).forEach((card, index) => {
    const options = shuffleArray([card.back, ...cards.filter((c) => c.id !== card.id).slice(0, 2).map((c) => c.back)]).slice(0, 3);
    questions.push({
      id: `mcq-${index}`,
      type: "mcq",
      question: `Which best matches: ${card.front}?`,
      options,
      correct: card.back,
    });
  });

  topicPool.slice(0, 4).forEach((topic, i) => {
    questions.push({
      id: `topic-${i}`,
      type: "topic",
      question: `Which topic is this review prompt about: "Apply rules and explain why they work"?`,
      options: shuffleArray([topic, ...topicPool.filter((t) => t !== topic).slice(0, 2)]),
      correct: topic,
    });
  });

  return { questions };
}

function generateSummaryNotes(item, profile) {
  const hardTopics = profile.topics
    .map((topic) => ({ topic, weight: profile.topicWeights[topic.toLowerCase()] || 1 }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((entry) => entry.topic);

  return `Focus first on ${hardTopics.join(", ") || "core topics"}. Use homework/class practice for application, then close each session with a 5-minute recall summary and error log.`;
}

function generateDeliverables(item) {
  if (item.type === "exam") {
    return ["Complete all planned study sessions", "Finish practice sets", "Run final review day", "Prepare quick formula/term sheet"];
  }
  if (item.type === "project") {
    return ["Requirements clarified", "Milestones completed", "Risk review completed", "Final polish + submission"];
  }
  return ["Prompt understood", "Draft completed", "Revision completed", "Final submission check done"];
}

function computeProgress(item) {
  const totalSessions = item.calendarEvents.length || 1;
  const completed = item.progress.completedSessions || [];
  const sessionPct = Math.round((completed.length / totalSessions) * 100);
  const flashPct = item.flashcards.cards.length
    ? Math.round(((item.progress.flashcardMastered || []).length / item.flashcards.cards.length) * 100)
    : 0;
  const quizPct = item.progress.quizScore || 0;
  const percent = Math.round((sessionPct * 0.55) + (flashPct * 0.25) + (quizPct * 0.2));

  let readiness = "Low";
  if (percent >= 70) readiness = item.type === "exam" ? "High" : "On Track";
  else if (percent >= 40) readiness = item.type === "exam" ? "Medium" : "In Progress";

  return {
    ...item.progress,
    completedSessions: completed,
    percent,
    readiness,
  };
}

function buildRiskWarnings(item) {
  const warnings = [];
  const daysLeft = daysUntil(item.dueDate);
  const remainingSessions = Math.max(0, item.calendarEvents.length - (item.progress.completedSessions || []).length);

  if (daysLeft < 0) warnings.push("This item is overdue. Prioritize this immediately.");
  if (daysLeft <= 2 && item.progress.percent < 65) warnings.push("Deadline is close. Focus on highest-yield tasks now.");
  if (remainingSessions > daysLeft + 1) warnings.push("At current pace, you may not finish before the due date.");
  if (item.type === "exam" && item.academicProfile.majorTopics.length > Math.max(1, daysLeft + 1)) warnings.push("Too many major topics remain for the available days.");
  if (!warnings.length) warnings.push("On track. Stay consistent.");

  return warnings;
}

function computeNextAction(item) {
  const upcoming = item.calendarEvents
    .filter((e) => daysUntil(e.date) >= 0)
    .sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`))[0];
  if (upcoming) {
    return {
      title: `${upcoming.title} — ${estimateEventDuration(upcoming.title, item)} min`,
      description: `${formatDate(upcoming.date)} • ${titleCase(item.priority)} priority ${titleCase(item.type)}`,
      date: upcoming.date,
    };
  }
  return { title: `Review ${item.title} — 30 min`, description: "No upcoming session found, run a quick checkpoint.", date: toISO(new Date()) };
}

function computeGlobalNextAction(items) {
  const candidates = items.map((item) => ({ ...(item.nextAction || computeNextAction(item)), itemId: item.id }));
  return candidates.sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`))[0] || null;
}

function computeWorkloadInsights(items) {
  const events = allCalendarEvents().filter((e) => daysUntil(e.date) >= 0 && daysUntil(e.date) <= 7);
  const deadlines = items.filter((item) => daysUntil(item.dueDate) >= 0 && daysUntil(item.dueDate) <= 5).length;
  const totalMinutes = events.reduce((sum, event) => sum + estimateEventDuration(event.title, items.find((i) => i.id === event.itemId)), 0);
  const hrsPerDay = totalMinutes / 60 / 7;
  const overloaded = hrsPerDay > 3.5 || deadlines >= 4;

  return {
    overloaded,
    message: `You have ${deadlines} deadline(s) in the next 5 days. Recommended workload: ${hrsPerDay.toFixed(1)} hrs/day.${overloaded ? " You are overloaded—move one session +1d or start earlier." : " Workload looks manageable."}`,
  };
}

function buildDailySchedule(items, dateISO) {
  return allCalendarEvents()
    .filter((e) => e.date === dateISO)
    .map((e) => ({
      itemId: e.itemId,
      title: e.title,
      duration: `${estimateEventDuration(e.title, items.find((i) => i.id === e.itemId))} min`,
      label: e.label,
    }));
}

function buildWeekSchedule(items) {
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(new Date(), i);
    const iso = toISO(date);
    const blocks = buildDailySchedule(items, iso);
    days.push({
      date: iso,
      dayLabel: date.toLocaleDateString(undefined, { weekday: "long" }),
      blocks,
      totalHours: blocks.reduce((sum, b) => sum + Number(b.duration.replace(" min", "")) / 60, 0),
    });
  }
  return days;
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) throw new Error("PDF.js unavailable");
  const data = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data }).promise;
  let text = "";
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    text += `\n[Page ${pageNo}] ` + content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
  }
  return text.trim();
}

function parseTopicDifficulty(text) {
  const map = {};
  text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [topic, diff] = line.split(":").map((part) => part?.trim());
      if (!topic || !diff) return;
      map[topic.toLowerCase()] = diff.toLowerCase();
    });
  return map;
}

function parseVocabLines(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [term, definition] = line.split(/\s[-–:]\s/);
      return { term: (term || line).trim(), definition: (definition || "").trim(), status: "new" };
    });
}

function parseTopicList(text) {
  return text
    .split(/[\n,;]+/)
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 2)
    .slice(0, 20);
}

function parseQuestionLines(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 10)
    .slice(0, 20);
}

function detectTopicForQuestion(question, topics) {
  const lower = question.toLowerCase();
  return topics.find((topic) => lower.includes(topic.toLowerCase())) || topics[0] || "General";
}

function topicConfidenceWeights(map, topics) {
  const result = {};
  topics.forEach((topic) => {
    const label = map?.[topic.toLowerCase()];
    if (label === "weak") result[topic.toLowerCase()] = 1.45;
    else if (label === "somewhat") result[topic.toLowerCase()] = 1.2;
    else result[topic.toLowerCase()] = 1;
  });
  return result;
}

function difficultyToWeight(difficulty) {
  if (difficulty === "hard") return 1.45;
  if (difficulty === "easy") return 0.85;
  return 1.1;
}

function estimateEventDuration(title, item) {
  const match = String(title).match(/(\d+)\s*min/i);
  if (match) return Number(match[1]);
  if (item?.difficulty === "hard") return 75;
  if (item?.difficulty === "easy") return 35;
  return 50;
}

function urgencyLabel(item) {
  const days = daysUntil(item.dueDate);
  if (days < 0) return "Behind";
  if (days <= 1) return "Due soon";
  if (item.progress.percent < 30 && days <= 4) return "Start now";
  if (item.progress.percent >= 70) return "On track";
  return "Review today";
}

function sortedByDueDate(items) {
  return [...items].sort((a, b) => new Date(`${a.dueDate}T00:00:00`) - new Date(`${b.dueDate}T00:00:00`));
}

function daysUntil(isoDate) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(`${isoDate}T00:00:00`);
  return Math.floor((target - start) / 86400000);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDate(isoDate) {
  if (!isoDate) return "No date";
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

function uniqueCaseInsensitive(values) {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  });
  return out;
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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
  "question",
  "questions",
]);
