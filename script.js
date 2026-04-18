// StudyFlow v3 - static, beginner-friendly AI-style academic dashboard.

const STORAGE_KEY = "studyflow_classes_v3";
const app = document.getElementById("app");

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.js";
}

const state = {
  classes: loadClasses(),
  currentClassId: null,
  activeTab: "overview",
};

renderApp();

// ------------------------------
// Storage
// ------------------------------
function loadClasses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.classes));
}

function getClassById(id) {
  return state.classes.find((course) => course.id === id);
}

function ensureClassShape(course) {
  return {
    ...course,
    taskType: course.taskType || "exam",
    inputs: {
      materials: "",
      testStyle: "",
      emphasis: "",
      struggles: "",
      otherNotes: "",
      uploadedFiles: [],
      extractedPdfText: "",
      ...(course.inputs || {}),
    },
    outputs: {
      studyPlan: "",
      summaryNotes: "",
      practiceQuestions: "",
      flashcards: "",
      assignmentSteps: "",
      workTimeline: "",
      deliverables: "",
      clarifyQuestions: "",
      ...(course.outputs || {}),
    },
    chatHistory: course.chatHistory || [],
    progress: course.progress || {},
    updatedAt: course.updatedAt || new Date().toISOString(),
  };
}

// ------------------------------
// Rendering entry
// ------------------------------
function renderApp() {
  state.classes = state.classes.map(ensureClassShape);

  if (state.currentClassId) {
    renderWorkspace(state.currentClassId);
  } else {
    renderDashboard();
  }
}

function renderDashboard() {
  const template = document.getElementById("dashboard-template");
  app.innerHTML = "";
  app.appendChild(template.content.cloneNode(true));

  const addPanel = document.getElementById("add-class-panel");
  const classForm = document.getElementById("class-form");
  const classGrid = document.getElementById("class-grid");

  document.getElementById("open-add-class").addEventListener("click", () => addPanel.classList.remove("hidden"));
  document.getElementById("cancel-add-class").addEventListener("click", () => {
    addPanel.classList.add("hidden");
    classForm.reset();
  });

  classForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(classForm);

    const course = ensureClassShape({
      id: crypto.randomUUID(),
      name: (form.get("name") || "Untitled Class").toString().trim(),
      professor: (form.get("professor") || "Unknown").toString().trim(),
      taskType: (form.get("taskType") || "exam").toString(),
      examDate: (form.get("examDate") || "").toString(),
      tag: (form.get("tag") || "").toString().trim(),
      createdAt: new Date().toISOString(),
    });

    state.classes.unshift(course);
    persist();
    renderDashboard();
  });

  if (state.classes.length === 0) {
    classGrid.innerHTML = `
      <div class="empty-state">
        <h4>No classes yet</h4>
        <p>Add your first class to unlock smart study planning, assignment support, and tutor chat.</p>
      </div>
    `;
    return;
  }

  classGrid.innerHTML = state.classes
    .map((course) => {
      const readiness = calculateReadiness(course);
      const dueLabel = course.examDate ? formatDate(course.examDate) : "Not set";
      const fileCount = course.inputs.uploadedFiles.length;
      const border = pickTagColor(course.tag);

      return `
        <article class="card class-card" style="border-left-color:${border}">
          <div class="readiness-row">
            <h4>${escapeHtml(course.name)}</h4>
            <span class="badge ${readiness.label.toLowerCase()}">${readiness.label}</span>
          </div>
          <p class="card-meta">Professor: ${escapeHtml(course.professor)}</p>
          <p class="card-meta">Next ${course.taskType === "project" ? "Due" : "Exam"}: ${escapeHtml(dueLabel)}</p>
          <p class="card-meta">Uploaded files: ${fileCount}</p>
          <div class="progress"><span style="width:${readiness.score}%"></span></div>
          <div class="card-actions">
            <button class="btn btn-primary open-class" data-id="${course.id}">Open</button>
            <button class="btn btn-danger delete-class" data-id="${course.id}">Delete</button>
          </div>
        </article>
      `;
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
      const item = getClassById(id);
      if (!item) return;

      if (!window.confirm(`Delete ${item.name}? This cannot be undone.`)) return;
      state.classes = state.classes.filter((course) => course.id !== id);
      persist();
      renderDashboard();
    });
  });
}

function renderWorkspace(classId) {
  const course = getClassById(classId);
  if (!course) {
    state.currentClassId = null;
    renderDashboard();
    return;
  }

  const template = document.getElementById("workspace-template");
  app.innerHTML = "";
  app.appendChild(template.content.cloneNode(true));

  document.getElementById("workspace-title").textContent = `${course.name} Workspace`;
  document.getElementById("workspace-meta").textContent = `${course.professor} • ${
    course.taskType === "project" ? "Due" : "Exam"
  }: ${course.examDate ? formatDate(course.examDate) : "Not set"}`;

  renderReadinessOverview(course);
  renderTabNav();
  renderActiveTab(course);

  document.getElementById("back-btn").addEventListener("click", () => {
    state.currentClassId = null;
    renderApp();
  });
}

function renderTabNav() {
  const tabs = [
    ["overview", "Overview"],
    ["materials", "Materials"],
    ["examPrep", "Exam Prep"],
    ["assignments", "Assignments"],
    ["tutor", "Tutor Chat"],
  ];

  const nav = document.getElementById("tab-nav");
  nav.innerHTML = tabs
    .map(
      ([key, label]) =>
        `<button class="tab-btn ${state.activeTab === key ? "active" : ""}" data-tab="${key}">${label}</button>`
    )
    .join("");

  nav.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      renderWorkspace(state.currentClassId);
    });
  });
}

function renderActiveTab(course) {
  const container = document.getElementById("tab-content");

  if (state.activeTab === "overview") {
    container.innerHTML = renderOverviewTab(course);
    return;
  }

  if (state.activeTab === "materials") {
    container.innerHTML = renderMaterialsTab(course);
    bindMaterialsEvents(course);
    return;
  }

  if (state.activeTab === "examPrep") {
    container.innerHTML = renderExamPrepTab(course);
    bindOutputEvents(course);
    return;
  }

  if (state.activeTab === "assignments") {
    container.innerHTML = renderAssignmentsTab(course);
    bindOutputEvents(course);
    return;
  }

  container.innerHTML = renderTutorTab(course);
  bindTutorEvents(course);
}

// ------------------------------
// Tabs
// ------------------------------
function renderOverviewTab(course) {
  const readiness = calculateReadiness(course);
  const notesCount = countFilledNotes(course.inputs);
  const outputCount = countOutputs(course.outputs);

  return `
    <section class="grid-two">
      <article class="card tab-panel">
        <h3>Progress Snapshot</h3>
        <p class="card-meta">Readiness: <strong>${readiness.label}</strong> (${readiness.score}%)</p>
        <div class="progress"><span style="width:${readiness.score}%"></span></div>
        <p class="card-meta">Uploaded files: ${course.inputs.uploadedFiles.length}</p>
        <p class="card-meta">Notes sections filled: ${notesCount}/5</p>
        <p class="card-meta">Generated outputs: ${outputCount}</p>
      </article>
      <article class="card tab-panel">
        <h3>Suggested Next Action</h3>
        <p>${buildNextAction(course, readiness)}</p>
        <p class="small-note">Tip: keep Materials updated, then generate outputs in Exam Prep or Assignments tab.</p>
      </article>
    </section>
  `;
}

function renderMaterialsTab(course) {
  return `
    <section class="grid-two">
      <article class="card tab-panel">
        <h3>Materials & Notes</h3>
        <label>
          Task Type
          <select id="task-type">
            <option value="exam" ${course.taskType === "exam" ? "selected" : ""}>Exam</option>
            <option value="project" ${course.taskType === "project" ? "selected" : ""}>Project / Assignment</option>
          </select>
        </label>
        <label>Class Materials<textarea id="materials" rows="8">${escapeHtml(course.inputs.materials)}</textarea></label>
        <label>What previous tests have been like<textarea id="test-style" rows="4">${escapeHtml(course.inputs.testStyle)}</textarea></label>
        <label>What the professor emphasizes<textarea id="emphasis" rows="4">${escapeHtml(course.inputs.emphasis)}</textarea></label>
        <label>What I struggle with<textarea id="struggles" rows="4">${escapeHtml(course.inputs.struggles)}</textarea></label>
        <label>Other notes<textarea id="other-notes" rows="4">${escapeHtml(course.inputs.otherNotes)}</textarea></label>
        <div class="form-actions">
          <button class="btn btn-primary" id="save-materials">Save Notes</button>
          <button class="btn btn-ghost" id="clear-materials">Clear Notes</button>
        </div>
      </article>

      <article class="card tab-panel">
        <h3>Upload Files</h3>
        <div class="upload-panel">
          <label>
            Upload .txt and .pdf
            <input type="file" id="file-input" accept=".txt,.pdf" multiple />
          </label>
          <p class="small-note">Supported files: .txt, .pdf (text is extracted in your browser).</p>
          <p id="upload-status" class="upload-status"></p>
          <ul id="uploaded-files" class="uploaded-files">${renderFileList(course.inputs.uploadedFiles)}</ul>
        </div>
      </article>
    </section>
  `;
}

function renderExamPrepTab(course) {
  const mode = course.taskType;

  return `
    <section class="grid-two">
      <article class="card tab-panel">
        <h3>${mode === "exam" ? "Exam Prep Tools" : "Project Tools (Preview)"}</h3>
        <p class="small-note">Current mode: ${mode === "exam" ? "Exam" : "Project / Assignment"}</p>
        <div class="action-row ${mode === "exam" ? "" : "hidden"}" id="exam-actions">
          <button class="btn btn-primary" data-gen="studyPlan">Generate Study Plan</button>
          <button class="btn btn-secondary" data-gen="summaryNotes">Generate Summary Notes</button>
          <button class="btn btn-secondary" data-gen="practiceQuestions">Generate Practice Questions</button>
          <button class="btn btn-secondary" data-gen="flashcards">Generate Flashcards</button>
        </div>
        <div class="action-row ${mode === "project" ? "" : "hidden"}" id="project-actions-a">
          <button class="btn btn-primary" data-gen="assignmentSteps">Break Assignment Into Steps</button>
          <button class="btn btn-secondary" data-gen="workTimeline">Generate Work Timeline</button>
          <button class="btn btn-secondary" data-gen="deliverables">Create Deliverables Checklist</button>
          <button class="btn btn-secondary" data-gen="clarifyQuestions">Identify Questions to Clarify</button>
        </div>
        <button class="btn btn-ghost" id="copy-output">Copy Output</button>
      </article>
      <article class="card tab-panel">
        <h3>Generated Output</h3>
        <div id="output" class="output-box">${escapeHtml(getLatestOutput(course) || "Choose a generator to create output.")}</div>
      </article>
    </section>
  `;
}

function renderAssignmentsTab(course) {
  return `
    <section class="grid-two">
      <article class="card tab-panel">
        <h3>Assignment Planner</h3>
        <p class="small-note">Works best in Project / Assignment mode.</p>
        <div class="action-row">
          <button class="btn btn-primary" data-gen="assignmentSteps">Break Assignment Into Steps</button>
          <button class="btn btn-secondary" data-gen="workTimeline">Generate Work Timeline</button>
          <button class="btn btn-secondary" data-gen="deliverables">Create Deliverables Checklist</button>
          <button class="btn btn-secondary" data-gen="clarifyQuestions">Identify Questions to Clarify</button>
        </div>
      </article>
      <article class="card tab-panel">
        <h3>Planner Output</h3>
        <div id="output" class="output-box">${escapeHtml(getLatestOutput(course) || "Generate assignment support output here.")}</div>
      </article>
    </section>
  `;
}

function renderTutorTab(course) {
  return `
    <section class="grid-two">
      <article class="card tab-panel">
        <h3>Tutor Chat</h3>
        <div class="action-row">
          <button class="btn btn-secondary suggested-prompt">Explain this topic simply</button>
          <button class="btn btn-secondary suggested-prompt">Quiz me on this class</button>
          <button class="btn btn-secondary suggested-prompt">What should I focus on next?</button>
          <button class="btn btn-secondary suggested-prompt">Help me break this assignment into steps</button>
        </div>
        <div class="chat-log" id="chat-log">${renderChat(course.chatHistory)}</div>
      </article>
      <article class="card tab-panel">
        <h3>Ask StudyFlow Tutor</h3>
        <label>
          Your question
          <textarea id="chat-input" rows="6" placeholder="Ask about topics, weak areas, planning, or test strategy..."></textarea>
        </label>
        <button class="btn btn-primary" id="send-chat">Send</button>
      </article>
    </section>
  `;
}

function renderReadinessOverview(course) {
  const readiness = calculateReadiness(course);
  const checklist = calculateProgressChecklist(course);

  document.getElementById("overview-readiness").innerHTML = `
    <div class="card">
      <div class="readiness-row">
        <strong>Readiness ${readiness.label}</strong>
        <span class="badge ${readiness.label.toLowerCase()}">${readiness.score}%</span>
      </div>
      <div class="progress"><span style="width:${readiness.score}%"></span></div>
      <p class="small-note">Files: ${course.inputs.uploadedFiles.length} • Notes: ${countFilledNotes(course.inputs)}/5 • Outputs: ${countOutputs(
    course.outputs
  )}</p>
      <ul class="uploaded-files">
        ${checklist.map((item) => `<li>${item.done ? "✅" : "⬜"} ${item.label}</li>`).join("")}
      </ul>
    </div>
  `;
}

// ------------------------------
// Materials + files
// ------------------------------
function bindMaterialsEvents(course) {
  const fileInput = document.getElementById("file-input");
  const status = document.getElementById("upload-status");

  document.getElementById("task-type").addEventListener("change", (event) => {
    course.taskType = event.target.value;
    touch(course);
    persist();
    renderWorkspace(course.id);
  });

  document.getElementById("save-materials").addEventListener("click", () => {
    saveMaterials(course);
    alert("Notes saved.");
    renderWorkspace(course.id);
  });

  document.getElementById("clear-materials").addEventListener("click", () => {
    if (!window.confirm("Clear all notes text for this class?")) return;

    course.inputs.materials = "";
    course.inputs.testStyle = "";
    course.inputs.emphasis = "";
    course.inputs.struggles = "";
    course.inputs.otherNotes = "";
    course.inputs.extractedPdfText = "";
    touch(course);
    persist();
    renderWorkspace(course.id);
  });

  fileInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    status.classList.remove("error");
    status.textContent = "Processing files...";

    let appended = "";
    for (const file of files) {
      const ext = getExt(file.name);

      if (ext === "txt") {
        const text = await file.text();
        appended += `\n\n[TXT: ${file.name}]\n${text}`;
        course.inputs.uploadedFiles.push({ name: file.name, type: "txt", addedAt: new Date().toISOString() });
        continue;
      }

      if (ext === "pdf") {
        try {
          const text = await extractPdfText(file);
          const cleaned = text.trim();
          appended += `\n\n[PDF: ${file.name}]\n${cleaned || "(Limited readable text extracted)"}`;
          course.inputs.extractedPdfText += `\n\n[PDF: ${file.name}]\n${cleaned}`;
          course.inputs.uploadedFiles.push({ name: file.name, type: "pdf", addedAt: new Date().toISOString() });
        } catch (error) {
          console.error(error);
          status.classList.add("error");
          status.textContent =
            "A PDF could not be fully processed. You can still continue and paste important text manually.";
          appended += `\n\n[PDF: ${file.name}]\n(Extraction failed or unreadable)`;
          course.inputs.uploadedFiles.push({ name: file.name, type: "pdf", addedAt: new Date().toISOString() });
        }
        continue;
      }

      status.classList.add("error");
      status.textContent = "Unsupported file found. Please upload .txt or .pdf only.";
    }

    course.inputs.materials = `${course.inputs.materials}${appended}`.trim();
    touch(course);
    persist();
    if (!status.classList.contains("error")) {
      status.textContent = `Uploaded ${files.length} file(s) successfully.`;
    }
    renderWorkspace(course.id);
  });

  document.querySelectorAll(".remove-file").forEach((button) => {
    button.addEventListener("click", () => {
      const idx = Number(button.dataset.index);
      course.inputs.uploadedFiles.splice(idx, 1);
      touch(course);
      persist();
      renderWorkspace(course.id);
    });
  });
}

function saveMaterials(course) {
  course.inputs.materials = document.getElementById("materials").value.trim();
  course.inputs.testStyle = document.getElementById("test-style").value.trim();
  course.inputs.emphasis = document.getElementById("emphasis").value.trim();
  course.inputs.struggles = document.getElementById("struggles").value.trim();
  course.inputs.otherNotes = document.getElementById("other-notes").value.trim();
  touch(course);
  persist();
}

function renderFileList(files) {
  if (!files.length) return "<li>No files uploaded yet.</li>";

  return files
    .map(
      (file, index) => `
        <li class="file-row">
          <span>${escapeHtml(file.name)} (${file.type.toUpperCase()})</span>
          <button class="btn btn-danger remove-file" data-index="${index}">Remove</button>
        </li>
      `
    )
    .join("");
}

// ------------------------------
// Output generators
// ------------------------------
function bindOutputEvents(course) {
  document.querySelectorAll("[data-gen]").forEach((button) => {
    button.addEventListener("click", () => {
      saveMaterialsIfVisible(course);
      const key = button.dataset.gen;
      const output = generateByKey(course, key);
      course.outputs[key] = output;
      touch(course);
      persist();
      const outputEl = document.getElementById("output");
      if (outputEl) outputEl.textContent = output;
      renderReadinessOverview(course);
    });
  });

  const copyBtn = document.getElementById("copy-output");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const text = document.getElementById("output")?.innerText.trim() || "";
      if (!text) return alert("Nothing to copy yet.");
      await navigator.clipboard.writeText(text);
      alert("Output copied.");
    });
  }
}

function saveMaterialsIfVisible(course) {
  const materials = document.getElementById("materials");
  if (!materials) return;
  saveMaterials(course);
}

function generateByKey(course, key) {
  const inputs = course.inputs;

  if (key === "studyPlan") return generateSmartStudyPlan(course, inputs);
  if (key === "summaryNotes") return generateSummaryNotes(course, inputs);
  if (key === "practiceQuestions") return generatePracticeQuestions(course, inputs);
  if (key === "flashcards") return generateFlashcards(course, inputs);
  if (key === "assignmentSteps") return generateAssignmentSteps(course, inputs);
  if (key === "workTimeline") return generateWorkTimeline(course, inputs);
  if (key === "deliverables") return generateDeliverables(course, inputs);
  return generateClarifyQuestions(course, inputs);
}

function generateSmartStudyPlan(course, inputs) {
  const today = new Date();
  const daysLeft = getDaysUntil(course.examDate);
  const topics = extractTopicsWithWeights(inputs);
  const weakTopics = splitPoints(inputs.struggles, 5);
  const emphasis = splitPoints(inputs.emphasis, 5);
  const testStyle = (inputs.testStyle || "mixed").toLowerCase();

  const materialSize = Math.max(1, inputs.materials.length);
  const recommendedMin = materialSize > 6000 ? 120 : materialSize > 3000 ? 90 : 60;

  const prioritized = topics
    .map((topic) => {
      let score = topic.weight;
      if (weakTopics.some((item) => topic.name.toLowerCase().includes(item.toLowerCase()))) score += 3;
      if (emphasis.some((item) => topic.name.toLowerCase().includes(item.toLowerCase()))) score += 2;
      if (looksHard(topic.name)) score += 2;
      return { ...topic, score };
    })
    .sort((a, b) => b.score - a.score);

  const highPriority = prioritized.slice(0, 4).map((item) => item.name);
  const harderTopics = prioritized.filter((item) => looksHard(item.name)).slice(0, 3).map((item) => item.name);

  const totalDays = Math.max(1, daysLeft);
  const planDays = [];
  for (let i = 0; i < totalDays; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    const isFinalReview = i === totalDays - 1;
    const focusTopic = prioritized[i % Math.max(1, prioritized.length)]?.name || "Core unit review";
    const weakFocus = weakTopics[i % Math.max(1, weakTopics.length)] || "recall + clarity";

    let block = `Day ${i + 1} (${formatDateISO(date)}): Focus on ${focusTopic}. `;
    if (i < Math.ceil(totalDays * 0.4)) {
      block += `Early phase: deep understanding + note rewrite. Target weak area: ${weakFocus}.`;
    } else if (i < Math.ceil(totalDays * 0.8)) {
      block += "Middle phase: practice retrieval, timed drills, and mixed-topic checks.";
    } else {
      block += "Late phase: reinforcement, exam-style practice, and memory consolidation.";
    }

    if (testStyle.includes("concept")) block += " Include conceptual explain-in-your-own-words drills.";
    if (testStyle.includes("problem") || testStyle.includes("calculation")) {
      block += " Include extra problem-solving sets and worked examples.";
    }

    if (isFinalReview) {
      block += " FINAL REVIEW DAY: light recap, formula/definition sweep, and confidence pass.";
    }

    planDays.push(block);
  }

  const practiceDay = Math.max(1, Math.ceil(totalDays * 0.6));

  return `Smart Study Plan for ${course.name}
Date generated: ${formatDateISO(today)}
Exam date: ${course.examDate ? formatDate(course.examDate) : "Not set"}
Days remaining: ${daysLeft}
Recommended study time/day: ${recommendedMin}-${recommendedMin + 25} minutes

High-priority topics:
- ${highPriority.join("\n- ") || "Core concepts, weak topics, and professor emphasis"}

Topics likely needing more time:
- ${harderTopics.join("\n- ") || "Complex/theoretical sections and weak areas"}

Suggested strategy:
- Review higher-difficulty topics earlier.
- Schedule practice questions by Day ${practiceDay}.
- Reinforcement + active recall in final 20% of timeline.

Day-by-day schedule:
${planDays.map((entry) => `- ${entry}`).join("\n")}

Final reminder:
- The day before the exam, avoid learning brand-new material. Prioritize high-yield review and confidence-building.`;
}

function generateSummaryNotes(course, inputs) {
  const topics = extractTopicsWithWeights(inputs).slice(0, 6).map((item) => item.name);
  const emphasis = splitPoints(inputs.emphasis, 4);

  return `Summary Notes for ${course.name}

Key themes/topics:
${topics.map((topic, idx) => `${idx + 1}) ${topic}`).join("\n") || "1) Core foundations\n2) Main frameworks\n3) Applications"}

Likely testable concepts:
- ${emphasis.join("\n- ") || "Definitions, high-yield comparisons, and common applications."}

What to review first:
- Topic overlap between class materials and weak areas.
- Concepts repeated in lecture notes/professor emphasis.
- Any formulas/models with multiple parts.`;
}

function generatePracticeQuestions(course, inputs) {
  const topics = extractTopicsWithWeights(inputs).slice(0, 5).map((item) => item.name);
  const style = (inputs.testStyle || "mixed conceptual + short answer").toLowerCase();
  const includeProblems = style.includes("problem") || style.includes("calculation") || style.includes("application");

  const base = [
    `1) Conceptual: Explain "${topics[0] || "a core topic"}" in your own words and provide one real example.`,
    `2) Short-answer: Compare "${topics[1] || "topic A"}" and "${topics[2] || "topic B"}" in 4-6 sentences.`,
    `3) Conceptual: Why is "${topics[3] || "this framework"}" important for the class overall?`,
    `4) Short-answer: Define "${topics[4] || "a key term"}" and list two common mistakes students make.`,
  ];

  if (includeProblems) {
    base.push("5) Application/Problem-solving: Solve a scenario question step by step and justify each decision.");
    base.push("6) Application: Create your own practice problem, then solve it without notes.");
  } else {
    base.push("5) Reflection: Teach the topic aloud in 60 seconds without looking at notes.");
    base.push("6) Retrieval: Write 5 quiz prompts your professor could ask and answer them.");
  }

  return `Practice Questions for ${course.name}\n\n${base.join("\n")}`;
}

function generateFlashcards(course, inputs) {
  const topics = extractTopicsWithWeights(inputs).slice(0, 8).map((item) => item.name);

  return `Flashcards for ${course.name}

${topics
  .map(
    (topic, i) =>
      `Card ${i + 1}\nFront: What is ${topic}?\nBack: Define it simply, add one key detail, and connect it to another class concept.`
  )
  .join("\n\n") ||
    "Card 1\nFront: Define the most important concept in this unit.\nBack: Give a plain-language definition + one example."}`;
}

function generateAssignmentSteps(course, inputs) {
  const topics = extractTopicsWithWeights(inputs).slice(0, 4).map((item) => item.name);

  return `Assignment Steps for ${course.name}

1) Clarify the assignment goal and grading rubric.
2) Gather requirements and source materials.
3) Build a rough outline/prototype around: ${topics.join(", ") || "core assignment requirements"}.
4) Complete first pass draft/build.
5) Add evidence/examples/citations and improve weak sections.
6) Final review + formatting + submission check.

Dependencies:
- You should not start final polishing before first pass draft is complete.
- You should not finalize conclusions before evidence/examples are assembled.`;
}

function generateWorkTimeline(course, inputs) {
  const daysLeft = Math.max(1, getDaysUntil(course.examDate));

  return `Work Timeline for ${course.name}
Days until due date: ${daysLeft}

Stage 1 (0-25%): Understand scope, rubric, and resources.
Stage 2 (25-60%): Draft or build core content.
Stage 3 (60-85%): Improve quality, add details, and test assumptions.
Stage 4 (85-100%): Final checks, polish, and submit early if possible.

Daily target: ${daysLeft <= 3 ? "90-120" : "45-90"} minutes of focused work.`;
}

function generateDeliverables(course) {
  return `Deliverables Checklist for ${course.name}

☐ Scope understood
☐ Outline/prototype created
☐ Core sections complete
☐ Citations/sources verified
☐ Final proofing done
☐ Submission requirements checked
☐ Submitted before deadline`;
}

function generateClarifyQuestions(course, inputs) {
  const emphasis = splitPoints(inputs.emphasis, 3).join(", ") || "the most heavily graded components";

  return `Questions to Clarify for ${course.name}

1) What are the top grading criteria?
2) What depth of detail is expected?
3) Are there required sources/formatting rules?
4) Can I get feedback on my outline before final submission?
5) Should I prioritize: ${emphasis}?`;
}

// ------------------------------
// Tutor chat
// ------------------------------
function bindTutorEvents(course) {
  document.querySelectorAll(".suggested-prompt").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById("chat-input");
      input.value = button.textContent;
      input.focus();
    });
  });

  document.getElementById("send-chat").addEventListener("click", () => {
    const input = document.getElementById("chat-input");
    const question = input.value.trim();
    if (!question) return;

    const answer = generateTutorResponse(course, question);
    course.chatHistory.push({ role: "user", text: question, at: new Date().toISOString() });
    course.chatHistory.push({ role: "assistant", text: answer, at: new Date().toISOString() });
    touch(course);
    persist();
    renderWorkspace(course.id);
  });
}

function renderChat(history) {
  if (!history.length) return `<p class="small-note">No chat yet. Ask your first question.</p>`;

  return history
    .map((msg) => `<div class="chat-msg ${msg.role}">${escapeHtml(msg.text)}</div>`)
    .join("");
}

function generateTutorResponse(course, question) {
  const q = question.toLowerCase();
  const weak = splitPoints(course.inputs.struggles, 3);
  const emphasis = splitPoints(course.inputs.emphasis, 3);
  const topics = extractTopicsWithWeights(course.inputs).slice(0, 4).map((item) => item.name);

  if (q.includes("quiz")) {
    return `Great idea—quick quiz time:\n1) Explain ${topics[0] || "the main unit concept"} in one minute.\n2) Compare ${
      topics[1] || "topic A"
    } vs ${topics[2] || "topic B"}.\n3) Give one application example for ${topics[3] || "a key topic"}.`;
  }

  if (q.includes("focus") || q.includes("next")) {
    return `Focus next on: ${weak.join(", ") || "your weakest area"}. Then reinforce professor priorities: ${
      emphasis.join(", ") || "core lecture concepts"
    }. After that, do one active recall round.`;
  }

  if (q.includes("assignment") || q.includes("steps")) {
    return generateAssignmentSteps(course, course.inputs);
  }

  return `Based on your class notes, start with ${topics[0] || "the core concept"}, then connect it to ${
    topics[1] || "related ideas"
  }. Keep explanations simple, and check weak areas: ${weak.join(", ") || "(none listed yet)"}.`;
}

// ------------------------------
// Progress + readiness
// ------------------------------
function calculateProgressChecklist(course) {
  const out = course.outputs;
  return [
    { label: "Uploaded at least 1 file", done: course.inputs.uploadedFiles.length > 0 },
    { label: "Added notes", done: countFilledNotes(course.inputs) > 0 },
    { label: "Generated study plan", done: Boolean(out.studyPlan) },
    { label: "Generated practice questions", done: Boolean(out.practiceQuestions) },
    { label: "Generated flashcards", done: Boolean(out.flashcards) },
    { label: "Generated assignment plan", done: Boolean(out.assignmentSteps || out.workTimeline) },
  ];
}

function calculateReadiness(course) {
  const checklist = calculateProgressChecklist(course);
  const done = checklist.filter((item) => item.done).length;
  const score = Math.round((done / checklist.length) * 100);
  const label = score >= 70 ? "High" : score >= 40 ? "Medium" : "Low";
  return { score, label };
}

function renderReadinessBadge(course) {
  return calculateReadiness(course).label;
}

function countFilledNotes(inputs) {
  const fields = [inputs.materials, inputs.testStyle, inputs.emphasis, inputs.struggles, inputs.otherNotes];
  return fields.filter((text) => text.trim()).length;
}

function countOutputs(outputs) {
  return Object.values(outputs).filter((value) => String(value || "").trim()).length;
}

function buildNextAction(course, readiness) {
  if (readiness.label === "Low") return "Start by adding materials and listing weak areas, then generate a first plan.";
  if (readiness.label === "Medium") return "Generate missing outputs (flashcards/practice) and run a tutor quiz.";
  return "Great momentum. Do reinforcement rounds and keep tuning weak topics before your deadline.";
}

function getLatestOutput(course) {
  const order = [
    course.outputs.studyPlan,
    course.outputs.summaryNotes,
    course.outputs.practiceQuestions,
    course.outputs.flashcards,
    course.outputs.assignmentSteps,
    course.outputs.workTimeline,
    course.outputs.deliverables,
    course.outputs.clarifyQuestions,
  ];
  return order.find((item) => String(item || "").trim()) || "";
}

function touch(course) {
  course.updatedAt = new Date().toISOString();
}

// ------------------------------
// Helpers
// ------------------------------
async function extractPdfText(file) {
  if (!window.pdfjsLib) throw new Error("PDF.js missing");
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += `\n[Page ${i}] ${content.items.map((item) => ("str" in item ? item.str : "")).join(" ")}`;
  }

  return text;
}

function getExt(fileName) {
  return fileName.toLowerCase().split(".").pop();
}

function splitPoints(text, max = 4) {
  if (!text.trim()) return [];
  return text
    .split(/\n|\.|,|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function extractTopicsWithWeights(inputs) {
  const text = `${inputs.materials}\n${inputs.emphasis}\n${inputs.struggles}`;
  const chunks = text
    .split(/\n|\.|,|;/)
    .map((part) => part.trim())
    .filter((part) => part.length > 4)
    .slice(0, 120);

  const map = new Map();
  for (const chunk of chunks) {
    const normalized = chunk.toLowerCase();
    map.set(normalized, (map.get(normalized) || 0) + 1);
  }

  return Array.from(map.entries())
    .map(([name, weight]) => ({ name: capitalize(name), weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);
}

function looksHard(topic) {
  const hardHints = ["proof", "derivation", "analysis", "algorithm", "case", "model", "equation", "theory"];
  const lower = topic.toLowerCase();
  return hardHints.some((hint) => lower.includes(hint)) || topic.length > 40;
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateISO(date) {
  return date.toISOString().slice(0, 10);
}

function getDaysUntil(value) {
  if (!value) return 0;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = new Date(`${value}T00:00:00`);
  return Math.max(0, Math.ceil((due - start) / (1000 * 60 * 60 * 24)));
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pickTagColor(tag) {
  const palette = ["#4f46e5", "#0f766e", "#0284c7", "#9333ea", "#db2777", "#b45309"];
  if (!tag) return palette[0];
  const sum = tag.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return palette[sum % palette.length];
}
