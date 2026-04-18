// StudyFlow - beginner-friendly static app using localStorage only.

const STORAGE_KEY = "studyflow_classes_v2";

const app = document.getElementById("app");

// Configure PDF.js worker from CDN for browser-side PDF text extraction.
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.js";
}

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
      taskType: formData.get("taskType")?.toString() || "exam",
      examDate: formData.get("examDate")?.toString() || "",
      tag: formData.get("tag")?.toString().trim() || "",
      inputs: {
        materials: "",
        testStyle: "",
        emphasis: "",
        struggles: "",
        otherNotes: "",
        uploadedFiles: [],
        extractedPdfText: "",
      },
      outputs: {
        main: "",
        secondary: "",
        tertiary: "",
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
      const examLabel = course.examDate ? formatDate(course.examDate) : "No date";
      const borderColor = pickTagColor(course.tag);
      const taskLabel = course.taskType === "project" ? "Project / Assignment" : "Exam";

      return `
      <article class="card class-card" style="border-left-color:${borderColor}">
        <div>
          <h4>${escapeHtml(course.name)}</h4>
          <p class="meta">Professor: ${escapeHtml(course.professor)}</p>
          <p class="meta">Task Type: ${escapeHtml(taskLabel)}</p>
          <p class="meta">Due: ${escapeHtml(examLabel)}</p>
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

  const workspaceMetaPrefix = course.taskType === "project" ? "Due" : "Exam";
  document.getElementById("workspace-title").textContent = `${course.name} Workspace`;
  document.getElementById(
    "workspace-meta"
  ).textContent = `${course.professor} • ${workspaceMetaPrefix}: ${course.examDate ? formatDate(course.examDate) : "Not set"}`;

  const taskType = document.getElementById("task-type");
  const materials = document.getElementById("materials");
  const fileInput = document.getElementById("materials-file");
  const uploadStatus = document.getElementById("upload-status");
  const uploadedFilesList = document.getElementById("uploaded-files");
  const testStyle = document.getElementById("test-style");
  const emphasis = document.getElementById("prof-emphasis");
  const struggles = document.getElementById("struggles");
  const otherNotes = document.getElementById("other-notes");
  const output = document.getElementById("output");

  taskType.value = course.taskType || "exam";
  materials.value = course.inputs.materials;
  testStyle.value = course.inputs.testStyle;
  emphasis.value = course.inputs.emphasis;
  struggles.value = course.inputs.struggles;
  otherNotes.value = course.inputs.otherNotes;
  output.textContent =
    course.outputs.main ||
    course.outputs.secondary ||
    course.outputs.tertiary ||
    "Choose one of the generation buttons to build your support content.";

  refreshActionLabels(taskType.value);
  renderUploadedFiles(course.inputs.uploadedFiles, uploadedFilesList);

  document.getElementById("back-btn").addEventListener("click", () => {
    state.currentClassId = null;
    renderApp();
  });

  taskType.addEventListener("change", () => {
    course.taskType = taskType.value;
    saveClasses();
    refreshActionLabels(taskType.value);
    uploadStatus.textContent =
      taskType.value === "project"
        ? "Project mode enabled. Generators now produce assignment-focused outputs."
        : "Exam mode enabled. Generators now produce exam-focused outputs.";
  });

  fileInput.addEventListener("change", async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length) return;

    uploadStatus.classList.remove("error");
    uploadStatus.textContent = "Processing uploads...";

    const newFileNames = [];
    let appendedText = "";

    for (const file of selectedFiles) {
      const extension = getFileExtension(file.name);
      newFileNames.push(file.name);

      if (extension === "txt") {
        const txtContent = await readTxtFile(file);
        appendedText += `\n\n[TXT: ${file.name}]\n${txtContent}`;
        continue;
      }

      if (extension === "pdf") {
        try {
          const extracted = await extractPdfText(file);
          const cleaned = extracted.trim();

          if (!cleaned || cleaned.length < 20) {
            uploadStatus.classList.add("error");
            uploadStatus.textContent =
              "PDF uploaded, but text extraction was limited. You can still paste important sections manually.";
            appendedText += `\n\n[PDF: ${file.name}]\n(Extraction produced limited readable text.)`;
          } else {
            appendedText += `\n\n[PDF: ${file.name}]\n${cleaned}`;
            uploadStatus.textContent = `Loaded ${file.name} successfully.`;
          }
        } catch (error) {
          console.error(error);
          uploadStatus.classList.add("error");
          uploadStatus.textContent =
            "We couldn't fully read one PDF. The app is still working—try another PDF or paste text manually.";
          appendedText += `\n\n[PDF: ${file.name}]\n(Unable to extract readable text.)`;
        }
        continue;
      }

      uploadStatus.classList.add("error");
      uploadStatus.textContent = `Skipped ${file.name}. Please upload .txt or .pdf files only.`;
    }

    if (appendedText.trim()) {
      materials.value = materials.value ? `${materials.value}${appendedText}` : appendedText.trim();
    }

    const mergedFiles = [...(course.inputs.uploadedFiles || []), ...newFileNames];
    const extractedPdfText = collectExtractedPdfSnippets(materials.value);

    updateCourseInputs(course.id, {
      ...collectInputs(),
      uploadedFiles: mergedFiles,
      extractedPdfText,
    });

    renderUploadedFiles(mergedFiles, uploadedFilesList);
    if (!uploadStatus.textContent) {
      uploadStatus.textContent = `Uploaded ${newFileNames.length} file(s).`;
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
      uploadedFiles: course.inputs.uploadedFiles || [],
      extractedPdfText: course.inputs.extractedPdfText || "",
    };
  }

  document.getElementById("save-notes").addEventListener("click", () => {
    updateCourseInputs(course.id, collectInputs());
    alert("Notes saved.");
  });

  document.getElementById("clear-form").addEventListener("click", () => {
    const confirmed = window.confirm("Clear all text fields for this class? Uploaded file names are kept for history.");
    if (!confirmed) return;

    materials.value = "";
    testStyle.value = "";
    emphasis.value = "";
    struggles.value = "";
    otherNotes.value = "";
    output.textContent = "Inputs cleared. Generate new outputs when ready.";

    const currentInputs = collectInputs();
    updateCourseInputs(course.id, {
      ...currentInputs,
      extractedPdfText: "",
    });
    updateCourseOutputs(course.id, {
      main: "",
      secondary: "",
      tertiary: "",
    });
  });

  document.getElementById("generate-plan").addEventListener("click", () => {
    const inputs = collectInputs();
    const mainOutput =
      taskType.value === "project" ? generateProjectWorkPlan(course, inputs) : generateStudyPlan(course, inputs);

    updateCourseInputs(course.id, inputs);
    updateCourseOutputs(course.id, { main: mainOutput });
    output.innerHTML = taskType.value === "project" ? escapeAndFormat(mainOutput) : mainOutput;
  });

  document.getElementById("generate-summary").addEventListener("click", () => {
    const inputs = collectInputs();
    const secondaryOutput =
      taskType.value === "project"
        ? generateProjectDeliverablesChecklist(course, inputs)
        : generateSummary(course, inputs);

    updateCourseInputs(course.id, inputs);
    updateCourseOutputs(course.id, { secondary: secondaryOutput });
    output.textContent = secondaryOutput;
  });

  document.getElementById("generate-questions").addEventListener("click", () => {
    const inputs = collectInputs();
    const tertiaryOutput =
      taskType.value === "project"
        ? generateProjectClarifyingQuestions(course, inputs)
        : generatePracticeQuestions(course, inputs);

    updateCourseInputs(course.id, inputs);
    updateCourseOutputs(course.id, { tertiary: tertiaryOutput });
    output.textContent = tertiaryOutput;
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

function refreshActionLabels(taskType) {
  const planButton = document.getElementById("generate-plan");
  const summaryButton = document.getElementById("generate-summary");
  const questionsButton = document.getElementById("generate-questions");

  if (!planButton || !summaryButton || !questionsButton) return;

  if (taskType === "project") {
    planButton.textContent = "Generate Work Plan";
    summaryButton.textContent = "Generate Deliverables Checklist";
    questionsButton.textContent = "Generate Clarifying Questions";
  } else {
    planButton.textContent = "Generate Study Plan";
    summaryButton.textContent = "Generate Summary Notes";
    questionsButton.textContent = "Generate Practice Questions";
  }
}

function renderUploadedFiles(files, targetElement) {
  if (!targetElement) return;

  if (!files || files.length === 0) {
    targetElement.innerHTML = `<li>No files uploaded yet.</li>`;
    return;
  }

  targetElement.innerHTML = files.map((name) => `<li>${escapeHtml(name)}</li>`).join("");
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
  const daysUntilExam = getDaysUntilDate(course.examDate);
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

function generateProjectWorkPlan(course, inputs) {
  const daysUntilDue = getDaysUntilDate(course.examDate);
  const topics = extractTopics(inputs.materials);
  const struggles = splitToBullets(inputs.struggles, 3);
  const emphasisPoints = splitToBullets(inputs.emphasis, 3);

  const timeline =
    daysUntilDue > 0
      ? `${daysUntilDue} days until the due date. Split your work into planning, drafting/building, and final polish.`
      : "Due date is today or passed. Prioritize a minimum viable submission and fast quality checks.";

  return `Step-by-Step Work Plan: ${course.name}

Timeline Suggestion
- ${timeline}

Task Breakdown
1) Understand scope and rubric (30-45 min)
2) Build outline/structure and gather sources (60-90 min)
3) Draft core sections or implement main build (2-3 focused blocks)
4) Integrate examples, citations, and professor emphasis (${emphasisPoints.join(", ") || "key scoring criteria"})
5) Final proofing/testing pass and submission checklist

Manageable Sprint Goals
- Sprint A: Define problem + plan approach using ${topics[0] || "project requirements"}
- Sprint B: Complete first draft/prototype around ${topics[1] || "main section"}
- Sprint C: Improve weak spots: ${struggles.join(", ") || "clarity, structure, and evidence"}
- Sprint D: Final quality pass + submit`;
}

function generateProjectDeliverablesChecklist(course, inputs) {
  const topics = extractTopics(inputs.materials);

  return `Deliverables Checklist: ${course.name}

☐ Confirm assignment requirements and grading rubric
☐ Finalize project outline / structure
☐ Complete main body or implementation sections
☐ Add visuals/examples/data where needed
☐ Include citations/references if required
☐ Proofread or run functionality checks
☐ Verify formatting and submission rules
☐ Submit before due date

Likely key deliverables based on your materials
- ${topics[0] || "Introduction or problem statement"}
- ${topics[1] || "Core analysis / implementation"}
- ${topics[2] || "Conclusion and final reflection"}`;
}

function generateProjectClarifyingQuestions(course, inputs) {
  const emphasisPoints = splitToBullets(inputs.emphasis, 4);

  return `Questions to Clarify Before Starting: ${course.name}

1) What are the top 3 grading criteria for this assignment?
2) Is this project evaluated more on depth, correctness, creativity, or presentation?
3) Are there required sources, tools, formats, or citation styles?
4) What does an excellent submission include that average submissions miss?
5) Can you share an example of a strong previous submission?
6) Are there common mistakes students make on this assignment?
7) Is collaboration allowed, and if so, what are the limits?
8) Should we prioritize these professor emphasis points: ${emphasisPoints.join(", ") || "(none provided yet)"}?`;
}

// -------------------------
// Upload helpers
// -------------------------
async function readTxtFile(file) {
  return file.text();
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js not available");
  }

  const bytes = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;

  let fullText = "";
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const textItems = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    fullText += `\n[Page ${pageNumber}] ${textItems}`;
  }

  return fullText;
}

function getFileExtension(fileName) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function collectExtractedPdfSnippets(materialsText) {
  return materialsText
    .split("[PDF:")
    .slice(1)
    .map((segment) => `[PDF:${segment}`)
    .join("\n")
    .trim();
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

function getDaysUntilDate(dateString) {
  if (!dateString) return 0;

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(`${dateString}T00:00:00`);
  const diff = target - start;
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

function escapeAndFormat(text) {
  return escapeHtml(text).replaceAll("\n", "<br>");
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
