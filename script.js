// StudyFlow - beginner-friendly static app using localStorage only.

const STORAGE_KEY = "studyflow_classes_v1";

const app = document.getElementById("app");

const state = {
  classes: loadClasses(),
  currentClassId: null,
};

renderApp();

// -------------------------
// Storage logic
// -------------------------
function loadClasses() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error("Error reading saved classes:", error);
    return [];
  }
}

function saveClasses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.classes));
}

function getClassById(classId) {
  return state.classes.find((item) => item.id === classId);
}

// -------------------------
// Rendering logic
// -------------------------
function renderApp() {
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

  const openAddBtn = document.getElementById("open-add-class");
  const cancelBtn = document.getElementById("cancel-add-class");
  const addPanel = document.getElementById("add-class-panel");
  const classForm = document.getElementById("class-form");
  const classGrid = document.getElementById("class-grid");

  openAddBtn.addEventListener("click", () => addPanel.classList.remove("hidden"));
  cancelBtn.addEventListener("click", () => {
    addPanel.classList.add("hidden");
    classForm.reset();
  });

  classForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(classForm);

    const newClass = {
      id: crypto.randomUUID(),
      name: formData.get("name")?.toString().trim() || "Untitled Class",
      professor: formData.get("professor")?.toString().trim() || "Unknown",
      examDate: formData.get("examDate")?.toString() || "",
      tag: formData.get("tag")?.toString().trim() || "",
      inputs: {
        materials: "",
        testStyle: "",
        emphasis: "",
        struggles: "",
        otherNotes: "",
      },
      outputs: {
        studyPlan: "",
        summaryNotes: "",
        practiceQuestions: "",
      },
      updatedAt: new Date().toISOString(),
    };

    state.classes.unshift(newClass);
    saveClasses();
    renderDashboard();
  });

  if (state.classes.length === 0) {
    classGrid.innerHTML = `
      <div class="empty-state">
        <h4>No classes yet</h4>
        <p>Add your first class to start building a personalized study flow.</p>
      </div>
    `;
    return;
  }

  classGrid.innerHTML = state.classes
    .map((course) => {
      const examLabel = course.examDate ? formatDate(course.examDate) : "No exam date";
      const borderColor = pickTagColor(course.tag);

      return `
      <article class="card class-card" style="border-left-color:${borderColor}">
        <div>
          <h4>${escapeHtml(course.name)}</h4>
          <p class="meta">Professor: ${escapeHtml(course.professor)}</p>
          <p class="meta">Exam: ${escapeHtml(examLabel)}</p>
          <p class="meta">Tag: ${escapeHtml(course.tag || "None")}</p>
        </div>
        <div class="card-actions">
          <button class="btn btn-primary open-workspace" data-id="${course.id}">Open Workspace</button>
          <button class="btn btn-danger delete-class" data-id="${course.id}">Delete</button>
        </div>
      </article>
    `;
    })
    .join("");

  document.querySelectorAll(".open-workspace").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentClassId = button.dataset.id;
      renderApp();
    });
  });

  document.querySelectorAll(".delete-class").forEach((button) => {
    button.addEventListener("click", () => {
      const classId = button.dataset.id;
      const course = getClassById(classId);
      if (!course) return;

      const shouldDelete = window.confirm(`Delete ${course.name}? This cannot be undone.`);
      if (!shouldDelete) return;

      state.classes = state.classes.filter((item) => item.id !== classId);
      saveClasses();
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
  document.getElementById(
    "workspace-meta"
  ).textContent = `${course.professor} • Exam: ${course.examDate ? formatDate(course.examDate) : "Not set"}`;

  const materials = document.getElementById("materials");
  const fileInput = document.getElementById("materials-file");
  const testStyle = document.getElementById("test-style");
  const emphasis = document.getElementById("prof-emphasis");
  const struggles = document.getElementById("struggles");
  const otherNotes = document.getElementById("other-notes");
  const output = document.getElementById("output");

  materials.value = course.inputs.materials;
  testStyle.value = course.inputs.testStyle;
  emphasis.value = course.inputs.emphasis;
  struggles.value = course.inputs.struggles;
  otherNotes.value = course.inputs.otherNotes;
  output.textContent =
    course.outputs.studyPlan ||
    course.outputs.summaryNotes ||
    course.outputs.practiceQuestions ||
    "Choose one of the generation buttons to build your support content.";

  document.getElementById("back-btn").addEventListener("click", () => {
    state.currentClassId = null;
    renderApp();
  });

  fileInput.addEventListener("change", async (event) => {
    const selected = event.target.files[0];
    if (!selected) return;

    try {
      const text = await selected.text();
      const appendText = text.trim();
      materials.value = materials.value ? `${materials.value}\n\n${appendText}` : appendText;
      updateCourseInputs(course.id, collectInputs());
    } catch (error) {
      alert("Could not read file. Please upload a valid .txt file.");
      console.error(error);
    }

    fileInput.value = "";
  });

  function collectInputs() {
    return {
      materials: materials.value.trim(),
      testStyle: testStyle.value.trim(),
      emphasis: emphasis.value.trim(),
      struggles: struggles.value.trim(),
      otherNotes: otherNotes.value.trim(),
    };
  }

  document.getElementById("save-notes").addEventListener("click", () => {
    updateCourseInputs(course.id, collectInputs());
    alert("Notes saved.");
  });

  document.getElementById("clear-form").addEventListener("click", () => {
    const confirmed = window.confirm("Clear all text fields for this class? You can still keep class info.");
    if (!confirmed) return;

    materials.value = "";
    testStyle.value = "";
    emphasis.value = "";
    struggles.value = "";
    otherNotes.value = "";
    output.textContent = "Inputs cleared. Generate new outputs when ready.";

    const clearedInputs = collectInputs();
    updateCourseInputs(course.id, clearedInputs);
    updateCourseOutputs(course.id, {
      studyPlan: "",
      summaryNotes: "",
      practiceQuestions: "",
    });
  });

  document.getElementById("generate-plan").addEventListener("click", () => {
    const inputs = collectInputs();
    const plan = generateStudyPlan(course, inputs);
    updateCourseInputs(course.id, inputs);
    updateCourseOutputs(course.id, { studyPlan: plan });
    output.innerHTML = plan;
  });

  document.getElementById("generate-summary").addEventListener("click", () => {
    const inputs = collectInputs();
    const summary = generateSummary(course, inputs);
    updateCourseInputs(course.id, inputs);
    updateCourseOutputs(course.id, { summaryNotes: summary });
    output.textContent = summary;
  });

  document.getElementById("generate-questions").addEventListener("click", () => {
    const inputs = collectInputs();
    const questions = generatePracticeQuestions(course, inputs);
    updateCourseInputs(course.id, inputs);
    updateCourseOutputs(course.id, { practiceQuestions: questions });
    output.textContent = questions;
  });

  document.getElementById("copy-output").addEventListener("click", async () => {
    const textToCopy = output.innerText.trim();
    if (!textToCopy) {
      alert("Nothing to copy yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      alert("Output copied to clipboard.");
    } catch (error) {
      console.error(error);
      alert("Copy failed. Try selecting the text manually.");
    }
  });
}

// -------------------------
// Update helpers
// -------------------------
function updateCourseInputs(classId, inputs) {
  const course = getClassById(classId);
  if (!course) return;

  course.inputs = inputs;
  course.updatedAt = new Date().toISOString();
  saveClasses();
}

function updateCourseOutputs(classId, outputChanges) {
  const course = getClassById(classId);
  if (!course) return;

  course.outputs = {
    ...course.outputs,
    ...outputChanges,
  };
  course.updatedAt = new Date().toISOString();
  saveClasses();
}

// -------------------------
// Generation logic
// -------------------------
function generateStudyPlan(course, inputs) {
  const daysUntilExam = getDaysUntilExam(course.examDate);
  const topics = extractTopics(inputs.materials);
  const emphasisPoints = splitToBullets(inputs.emphasis, 3);
  const strugglePoints = splitToBullets(inputs.struggles, 3);
  const testStyle = inputs.testStyle || "mixed conceptual and short-answer questions";

  const timelineText =
    daysUntilExam > 1
      ? `${daysUntilExam} days remaining before the exam.`
      : daysUntilExam === 1
      ? "1 day remaining before the exam."
      : "Exam date is today or passed—focus on rapid review and recall drills.";

  const checklist = [
    `Review high-yield themes: ${topics.slice(0, 4).join(", ") || "course definitions, key frameworks, and examples"}.`,
    `Prioritize professor emphasis: ${emphasisPoints.join(" | ") || "focus areas not provided yet"}.`,
    `Target weak areas: ${strugglePoints.join(" | ") || "identify at least 2 weak topics to drill"}.`,
    `Practice in likely format: ${testStyle}.`,
    "End each study session with a 10-minute recall quiz without notes.",
  ];

  return `
<h4>Personalized Study Plan for ${escapeHtml(course.name)}</h4>
<p><strong>Timeline:</strong> ${escapeHtml(timelineText)}</p>
<p><strong>Priority Strategy:</strong> Start with professor-priority material, then reinforce weaker areas, and finish with timed practice.</p>
<ul class="progress-list">
  ${checklist.map((item) => `<li>☐ ${escapeHtml(item)}</li>`).join("")}
</ul>
<p><strong>Suggested Flow:</strong></p>
<p>1) Warm-up review (20 min) → 2) Focus block on key topics (45 min) → 3) Practice questions (25 min) → 4) Quick summary rewrite (10 min).</p>
`;
}

function generateSummary(course, inputs) {
  const topics = extractTopics(inputs.materials);
  const emphasisPoints = splitToBullets(inputs.emphasis, 4);
  const testStyle = inputs.testStyle || "mixed question types";
  const struggles = splitToBullets(inputs.struggles, 3);

  return `Summary Notes: ${course.name}

1) Key Themes Identified
- ${topics[0] || "Core course definitions and vocabulary"}
- ${topics[1] || "Major models, theories, or frameworks"}
- ${topics[2] || "Comparisons between similar concepts"}
- ${topics[3] || "Applications and examples"}

2) Professor Emphasis
- ${emphasisPoints[0] || "Foundational principles"}
- ${emphasisPoints[1] || "Concept clarity"}
- ${emphasisPoints[2] || "Real-world interpretation"}
- ${emphasisPoints[3] || "Common pitfalls"}

3) Test Preparation Focus
- Expected style: ${testStyle}
- Spend extra time on: ${struggles.join(", ") || "your weakest unit and one high-priority concept"}
- Build one-page sheet of terms, formulas, and examples for final review.`;
}

function generatePracticeQuestions(course, inputs) {
  const topics = extractTopics(inputs.materials);
  const testStyle = inputs.testStyle || "short-answer and conceptual reasoning";
  const struggles = splitToBullets(inputs.struggles, 2);

  return `Practice Questions: ${course.name}
Likely test style: ${testStyle}

Conceptual Questions
1) Explain the main idea behind "${topics[0] || "the core concept from this unit"}" in your own words.
2) Compare and contrast "${topics[1] || "two important theories"}" and "${topics[2] || "a related framework"}".
3) Why might a professor emphasize "${topics[3] || "foundational definitions"}" before advanced topics?

Short-Answer Questions
4) Define "${topics[0] || "a key term"}" and give one concrete example.
5) Write a 4-6 sentence response to a scenario involving "${topics[1] || "a commonly tested concept"}".
6) List two mistakes students make on this topic and how to avoid them.

Weak-Area Drill
7) Create a mini flashcard set for: ${struggles.join(" and ") || "your most difficult concepts"}.
8) Teach one difficult topic aloud in under 60 seconds without notes.`;
}

// -------------------------
// Utility helpers
// -------------------------
function formatDate(dateString) {
  if (!dateString) return "No date";

  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getDaysUntilExam(dateString) {
  if (!dateString) return 0;

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const exam = new Date(`${dateString}T00:00:00`);
  const diff = exam - start;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractTopics(text) {
  if (!text.trim()) return [];

  // Very simple placeholder topic extraction for version 1.
  const chunks = text
    .split(/\n|\.|;|,/)
    .map((part) => part.trim())
    .filter((part) => part.length > 4);

  const unique = [];
  for (const chunk of chunks) {
    const cleaned = chunk.replace(/^[-*\d)\s]+/, "").trim();
    const normalized = cleaned.toLowerCase();
    if (cleaned && !unique.some((item) => item.toLowerCase() === normalized)) {
      unique.push(cleaned);
    }
    if (unique.length >= 8) break;
  }

  return unique;
}

function splitToBullets(text, max = 4) {
  if (!text.trim()) return [];

  return text
    .split(/\n|\.|,|;/)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .slice(0, max);
}

function pickTagColor(tag) {
  const palette = ["#4459ff", "#0f766e", "#b45309", "#7c3aed", "#db2777", "#0284c7"];
  if (!tag) return palette[0];

  const total = tag.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[total % palette.length];
}
