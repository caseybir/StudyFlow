'use strict';

const STORAGE_KEY = 'studyflow_v4';
const PDFJS_VERSION = '4.3.136';
const SECTION_KEYS = ['topics', 'homework', 'classPractice', 'weakAreas', 'vocab', 'notes'];
const TYPE_META = {
  exam: { label: 'Exam', className: 'exam' },
  problem_set: { label: 'Problem Set / Homework', className: 'problem_set' },
  essay: { label: 'Essay / Paper', className: 'essay' },
  project: { label: 'Project', className: 'project' },
  vocab: { label: 'Vocab / Memorization Test', className: 'vocab' },
  presentation: { label: 'Presentation', className: 'presentation' },
};
const TYPE_OPTIONS = Object.keys(TYPE_META);

const state = {
  items: [],
  view: 'dashboard',
  monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedStudyItemId: null,
  studyMode: 'plan',
  flashcardIndex: 0,
  flashcardFlipped: false,
  addPrefillType: 'exam',
};

function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function safeJsonParse(v, fallback) { try { return JSON.parse(v); } catch { return fallback; } }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items })); }
function toDate(s) { return new Date(`${s}T00:00:00`); }
function addDays(d, days) { const t = new Date(d); t.setDate(t.getDate() + days); return t; }
function todayISO() { return new Date().toISOString().slice(0, 10); }

function emptyStudyInputs() {
  return {
    topics: { text: '', files: [] },
    homework: { text: '', files: [] },
    classPractice: { text: '', files: [] },
    weakAreas: { text: '', files: [] },
    vocab: { text: '', files: [] },
    notes: { text: '', files: [] },
  };
}

function normalizeType(rawType) {
  if (rawType === 'assignment') return 'problem_set';
  return TYPE_OPTIONS.includes(rawType) ? rawType : 'exam';
}

function normalizeItem(raw) {
  const studyInputs = { ...emptyStudyInputs(), ...(raw.studyInputs || {}) };
  for (const key of SECTION_KEYS) {
    studyInputs[key] = {
      text: studyInputs[key]?.text || '',
      files: Array.isArray(studyInputs[key]?.files) ? studyInputs[key].files : [],
    };
  }
  return {
    id: raw.id || uid(),
    title: raw.title || 'Untitled',
    className: raw.className || 'General',
    professor: raw.professor || '',
    type: normalizeType(raw.type),
    dueDate: raw.dueDate || todayISO(),
    priority: ['low', 'medium', 'high'].includes(raw.priority) ? raw.priority : 'medium',
    notes: raw.notes || '',
    studyInputs,
    generatedPlan: raw.generatedPlan || null,
    calendarEvents: Array.isArray(raw.calendarEvents) ? raw.calendarEvents : [],
    practiceQuestions: Array.isArray(raw.practiceQuestions) ? raw.practiceQuestions : [],
    flashcards: Array.isArray(raw.flashcards) ? raw.flashcards : [],
    quiz: Array.isArray(raw.quiz) ? raw.quiz : [],
    mastery: raw.mastery || { know: 0, studyAgain: 0, quizScore: 0 },
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
  };
}

function load() {
  const parsed = safeJsonParse(localStorage.getItem(STORAGE_KEY), { items: [] });
  state.items = (parsed.items || []).map(normalizeItem).map(enrichItem);
  save();
}

function escapeHtml(v = '') {
  return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function inferTopics(item) {
  const explicit = item.studyInputs.topics.text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (explicit.length) return explicit.map((name, i) => ({ name, weight: explicit.length - i + 2 }));

  const blob = SECTION_KEYS.map((k) => item.studyInputs[k].text).join(' ').toLowerCase();
  const words = blob.match(/[a-z][a-z0-9\-]{3,}/g) || [];
  const stop = new Set(['this', 'that', 'with', 'from', 'have', 'into', 'your', 'using', 'should', 'about', 'where', 'when', 'what', 'then', 'than', 'also', 'will', 'must']);
  const freq = {};
  for (const w of words) {
    if (stop.has(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  const inferred = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, weight: count }));
  return inferred.length ? inferred : [{ name: 'Core concepts', weight: 4 }, { name: 'Applied practice', weight: 3 }];
}

function prioritizeTopics(item) {
  const weak = (item.studyInputs.weakAreas.text || '').toLowerCase();
  return inferTopics(item)
    .map((t) => ({ ...t, score: t.weight + (weak.includes(t.name.toLowerCase()) ? 3 : 0) }))
    .sort((a, b) => b.score - a.score);
}

function generateExamPlan(item) {
  const due = toDate(item.dueDate);
  const daysLeft = Math.max(2, Math.ceil((due - new Date()) / 86400000));
  const topics = prioritizeTopics(item);
  const studyDays = Math.min(12, Math.max(3, daysLeft - 1));
  const start = addDays(due, -studyDays);
  const studyDaysEntries = [];
  for (let i = 0; i < studyDays; i += 1) {
    const date = addDays(start, i).toISOString().slice(0, 10);
    const topic = topics[i % topics.length];
    const baseMins = 45 + Math.min(75, topic.score * 10);
    studyDaysEntries.push({
      date,
      topic: topic.name,
      duration: `${Math.round(baseMins / 15) * 15} min`,
      description: `Review ${topic.name}, then solve focused practice problems.`,
      label: i % 3 === 2 ? 'Review + practice' : 'Topic focus',
    });
    if (i % 4 === 3) {
      studyDaysEntries.push({
        date,
        topic: 'Mixed practice set',
        duration: '45 min',
        description: 'Mix old and new topics. Track mistakes for quick re-review.',
        label: 'Practice day',
      });
    }
  }
  studyDaysEntries.push({
    date: addDays(due, -1).toISOString().slice(0, 10),
    topic: 'Final review day',
    duration: '90 min',
    description: 'Recap weak areas + one timed mixed set + confidence review.',
    label: 'Final review',
  });

  return {
    type: 'exam',
    startDate: start.toISOString().slice(0, 10),
    studyDays: studyDaysEntries,
    checklist: ['Review all high-priority topics', 'Complete mixed practice', 'Prepare formula/concept quick sheet'],
    warnings: daysLeft < 3 ? ['Start now: exam is very close. Focus high-yield topics first.'] : [],
  };
}

function generateProblemSetPlan(item) {
  const due = toDate(item.dueDate);
  const start = addDays(due, -4);
  const concepts = prioritizeTopics(item).slice(0, 4).map((t) => t.name);
  const steps = [
    { title: 'Group problems by type', duration: '30 min', description: 'Sort assignment into concept groups and mark hardest ones.' },
    { title: 'Solve first pass', duration: '90 min', description: 'Complete easier and medium problems first for momentum.' },
    { title: 'Hard-problem block', duration: '75 min', description: `Focus hard problems (${concepts.join(', ') || 'key concepts'}).` },
    { title: 'Mistake log + formula review', duration: '45 min', description: 'Write mistakes and formulas/concepts to revisit.' },
    { title: 'Redo missed problems', duration: '45 min', description: 'Re-solve errors without looking at solutions.' },
  ].map((step, i) => ({ ...step, date: addDays(start, i).toISOString().slice(0, 10) }));
  return {
    type: 'problem_set',
    startDate: start.toISOString().slice(0, 10),
    steps,
    checklist: ['Problem groups created', 'Mistake log complete', 'Missed problems redone'],
    formulasToReview: concepts,
  };
}

function generateEssayPlan(item) {
  const due = toDate(item.dueDate);
  const start = addDays(due, -6);
  const steps = [
    ['Understand prompt + rubric', '35 min', 'Extract deliverables and grading criteria.'],
    ['Build thesis + outline', '60 min', 'Create argument structure and section flow.'],
    ['Draft introduction + body', '120 min', 'Write first full pass.'],
    ['Complete draft + citations', '90 min', 'Finish remaining sections and references.'],
    ['Revise for clarity', '60 min', 'Improve logic, transitions, and evidence quality.'],
    ['Proofreading day', '45 min', 'Grammar/style polish and final submission check.'],
  ].map((s, i) => ({ date: addDays(start, i).toISOString().slice(0, 10), title: s[0], duration: s[1], description: s[2] }));
  return { type: 'essay', startDate: start.toISOString().slice(0, 10), steps, checklist: ['Prompt requirements covered', 'Rubric checklist complete', 'Proofread before submit'] };
}

function generateProjectPlan(item) {
  const due = toDate(item.dueDate);
  const start = addDays(due, -8);
  const steps = [
    ['Scope + deliverables', '60 min', 'Define project boundaries and expected outputs.'],
    ['Research + design', '120 min', 'Collect references and design approach.'],
    ['Implementation phase 1', '150 min', 'Build core functionality / core sections.'],
    ['Implementation phase 2', '150 min', 'Complete remaining features and integration.'],
    ['Milestone review', '60 min', 'Validate progress against deliverables.'],
    ['Polish + QA', '75 min', 'Clean, test, and package final submission.'],
  ].map((s, i) => ({ date: addDays(start, Math.min(7, i + i)).toISOString().slice(0, 10), title: s[0], duration: s[1], description: s[2] }));
  const daysLeft = Math.ceil((due - new Date()) / 86400000);
  return {
    type: 'project',
    startDate: start.toISOString().slice(0, 10),
    steps,
    checklist: ['Milestones checked', 'Deliverables reviewed', 'Final polish completed'],
    warnings: daysLeft < 4 ? ['Start now warning: project timeline is tight.'] : [],
  };
}

function generateVocabPlan(item) {
  const due = toDate(item.dueDate);
  const start = addDays(due, -5);
  const entries = item.studyInputs.vocab.text.split('\n').map((v) => v.trim()).filter(Boolean).slice(0, 20);
  const steps = [
    ['Initial term pass', '30 min', `Study first set of terms (${Math.min(10, entries.length) || 10}).`],
    ['Flashcard repetition', '30 min', 'Flip through terms and mark weak ones.'],
    ['Recall quiz round', '35 min', 'Practice written recall and quick checks.'],
    ['Matching-style review', '30 min', 'Match terms to definitions/formulas.'],
    ['Final memory check', '25 min', 'Focus only “study again” terms.'],
  ].map((s, i) => ({ date: addDays(start, i).toISOString().slice(0, 10), title: s[0], duration: s[1], description: s[2] }));
  return { type: 'vocab', startDate: start.toISOString().slice(0, 10), steps, checklist: ['Flashcards reviewed', 'Recall quiz completed', 'Study-again list reduced'] };
}

function generatePresentationPlan(item) {
  const due = toDate(item.dueDate);
  const start = addDays(due, -5);
  const steps = [
    ['Outline talking points', '40 min', 'Define message arc and key evidence points.'],
    ['Slide preparation', '70 min', 'Build and align slides with talking points.'],
    ['Script + transitions', '45 min', 'Prepare speaking notes and transitions.'],
    ['Rehearsal run 1', '35 min', 'Time full run and refine pacing.'],
    ['Rehearsal run 2 + polish', '35 min', 'Finalize delivery and confidence checks.'],
  ].map((s, i) => ({ date: addDays(start, i).toISOString().slice(0, 10), title: s[0], duration: s[1], description: s[2] }));
  return { type: 'presentation', startDate: start.toISOString().slice(0, 10), steps, checklist: ['Slides finalized', 'Two rehearsals completed', 'Q&A prep notes ready'] };
}

function generatePlanByType(item) {
  if (item.type === 'exam') return generateExamPlan(item);
  if (item.type === 'problem_set') return generateProblemSetPlan(item);
  if (item.type === 'essay') return generateEssayPlan(item);
  if (item.type === 'project') return generateProjectPlan(item);
  if (item.type === 'vocab') return generateVocabPlan(item);
  return generatePresentationPlan(item);
}

function generatePracticeQuestions(item) {
  const pool = `${item.studyInputs.homework.text}\n${item.studyInputs.classPractice.text}`
    .split('\n').map((l) => l.trim()).filter(Boolean);
  if (item.type === 'problem_set' && pool.length) {
    return pool.slice(0, 8).map((q, i) => ({ q: `Problem ${i + 1}: ${q}`, a: 'Solve step-by-step, then check for arithmetic and concept mistakes.' }));
  }
  if (item.type === 'exam') {
    if (pool.length) return pool.slice(0, 8).map((q, i) => ({ q: `Practice set ${i + 1}: ${q}`, a: 'Explain method, then verify with notes.' }));
    return prioritizeTopics(item).slice(0, 6).map((t) => ({ q: `Explain and solve one application for ${t.name}.`, a: `Define ${t.name}, give one example, and include a quick self-check.` }));
  }
  return [];
}

function generateFlashcards(item) {
  const rows = item.studyInputs.vocab.text.split('\n').map((r) => r.trim()).filter(Boolean);
  const cards = [];
  for (const row of rows) {
    const [front, back] = row.split(/[:\-]/).map((x) => x?.trim()).filter(Boolean);
    if (front && back) cards.push({ front, back });
  }
  if (cards.length) return cards;
  if (item.type === 'exam') {
    return prioritizeTopics(item).slice(0, 10).map((t) => ({ front: `Define: ${t.name}`, back: `${t.name} explained in one sentence + one example.` }));
  }
  if (item.type === 'vocab') {
    return [{ front: 'Add vocab lines as Term: Definition', back: 'Example: Photosynthesis: Process plants use to make glucose.' }];
  }
  return [];
}

function generateQuiz(item) {
  if (!['exam', 'vocab'].includes(item.type)) return [];
  return generateFlashcards(item).slice(0, 8).map((c) => ({
    prompt: c.front,
    answer: c.back,
    options: [c.back, 'Not sure yet', 'Review this term', 'Skip for now'].sort(() => Math.random() - 0.5),
  }));
}

function planToCalendarEvents(item) {
  const events = [{ id: uid(), date: item.dueDate, title: `${item.title} due`, type: item.type, kind: 'due', itemId: item.id }];
  if (item.generatedPlan?.studyDays) {
    for (const s of item.generatedPlan.studyDays) events.push({ id: uid(), date: s.date, title: `${s.topic} — ${s.duration}`, type: item.type, kind: 'session', itemId: item.id });
  }
  if (item.generatedPlan?.steps) {
    for (const s of item.generatedPlan.steps) events.push({ id: uid(), date: s.date, title: `${s.title} — ${s.duration}`, type: item.type, kind: 'session', itemId: item.id });
  }
  return events;
}

function enrichItem(item) {
  const next = normalizeItem(item);
  next.generatedPlan = generatePlanByType(next);
  next.practiceQuestions = generatePracticeQuestions(next);
  next.flashcards = generateFlashcards(next);
  next.quiz = generateQuiz(next);
  next.calendarEvents = planToCalendarEvents(next);
  next.updatedAt = Date.now();
  return next;
}

function upsertItem(item) {
  const idx = state.items.findIndex((i) => i.id === item.id);
  if (idx >= 0) state.items[idx] = enrichItem(item);
  else state.items.unshift(enrichItem(item));
  save();
  render();
}

function deleteItem(id) {
  state.items = state.items.filter((i) => i.id !== id);
  save();
  closeModal();
  render();
}

function switchView(view) {
  state.view = view;
  if (view === 'add') renderAddForm();
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  if (view !== 'add') render();
}

function typeBadge(type) {
  const meta = TYPE_META[type] || TYPE_META.exam;
  return `<span class="badge ${meta.className}">${meta.label}</span>`;
}

function renderDashboard() {
  const root = document.getElementById('view-dashboard');
  const today = todayISO();
  const upcoming = [...state.items].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8);
  const allEvents = state.items.flatMap((i) => i.calendarEvents.map((e) => ({ ...e, item: i })));
  const nextAction = allEvents.filter((e) => e.kind === 'session' && e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const todayEvents = allEvents.filter((e) => e.kind === 'session' && e.date === today).slice(0, 6);
  const weekCutoff = addDays(new Date(), 7).toISOString().slice(0, 10);
  const dueWeek = state.items.filter((i) => i.dueDate >= today && i.dueDate <= weekCutoff).length;
  const startNow = state.items.filter((i) => i.priority === 'high' && i.dueDate <= addDays(new Date(), 2).toISOString().slice(0, 10));
  const counts = {
    exam: state.items.filter((i) => i.type === 'exam' && i.dueDate >= today).length,
    homework: state.items.filter((i) => i.type === 'problem_set' && i.dueDate >= today).length,
    essay: state.items.filter((i) => i.type === 'essay' && i.dueDate >= today).length,
  };

  root.innerHTML = `
    <div class="hero">
      <div>
        <h2>Your academic planning hub</h2>
        <p>Organize your exams, assignments, projects, and study sessions in one place.</p>
      </div>
      <div class="actions">
        <button class="btn primary" data-act="goto-add">+ Add New</button>
        <button class="btn" data-act="goto-calendar">Open Calendar</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <h3 class="section-title">Quick Add by Type</h3>
      <div class="actions">
        ${TYPE_OPTIONS.map((type) => `<button class="btn" data-act="quick-add" data-type="${type}">+ ${TYPE_META[type].label}</button>`).join('')}
      </div>
    </div>

    <div class="metrics">
      <div class="metric"><label>Upcoming Exams</label><b>${counts.exam}</b></div>
      <div class="metric"><label>Problem Sets</label><b>${counts.homework}</b></div>
      <div class="metric"><label>Essays / Papers</label><b>${counts.essay}</b></div>
      <div class="metric"><label>Due This Week</label><b>${dueWeek}</b></div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3 class="section-title">Next Study Action</h3>
        ${nextAction ? `<div class="card clickable" data-item="${nextAction.itemId}"><b>${escapeHtml(nextAction.title)}</b><p class="helper">For ${escapeHtml(nextAction.item.title)} (${nextAction.date})</p></div>` : '<p class="helper">Your next study action will appear here.</p>'}
      </div>
      <div class="card">
        <h3 class="section-title">Today’s Plan</h3>
        <div class="list">${todayEvents.length ? todayEvents.map((e) => `<div class="card clickable" data-item="${e.itemId}">${escapeHtml(e.title)}</div>`).join('') : '<p class="helper">No study sessions scheduled yet.</p>'}</div>
      </div>
    </div>

    <div class="grid-2" style="margin-top:14px">
      <div class="card">
        <h3 class="section-title">Upcoming Deadlines</h3>
        <div class="list">${upcoming.length ? upcoming.map((i) => `<div class="card clickable" data-item="${i.id}"><b>${escapeHtml(i.title)}</b> ${typeBadge(i.type)}<p class="helper">${escapeHtml(i.className)} • due ${i.dueDate}</p></div>`).join('') : '<p class="helper">No upcoming deadlines yet.</p>'}</div>
      </div>
      <div class="card">
        <h3 class="section-title">Start-Now Warnings</h3>
        <div class="list">${startNow.length ? startNow.map((i) => `<div class="card clickable" data-item="${i.id}">Start now: ${escapeHtml(i.title)} (${TYPE_META[i.type].label})</div>`).join('') : '<p class="helper">No urgent start-now warnings right now.</p>'}</div>
      </div>
    </div>
  `;
}

function renderSectionEditor(key, label, item) {
  const sec = item.studyInputs[key];
  return `
    <div class="card" style="margin:10px 0">
      <label>${label}</label>
      <textarea name="study_${key}">${escapeHtml(sec.text)}</textarea>
      <div class="upload-row">
        <input type="file" data-upload-key="${key}" accept=".pdf,.txt" multiple>
        <span class="helper" data-upload-status="${key}">Upload PDF/TXT for this section.</span>
      </div>
      <div class="file-list" data-file-list="${key}">
        ${sec.files.map((f, idx) => `<span class="file-chip">${escapeHtml(f.name)} (${escapeHtml(f.extractionStatus || 'saved')}) <button class="btn" style="padding:2px 6px" type="button" data-remove-file="${key}|${idx}">x</button></span>`).join('')}
      </div>
    </div>
  `;
}

function refreshFileList(root, key, files) {
  const fileList = root.querySelector(`[data-file-list='${key}']`);
  if (!fileList) return;
  fileList.innerHTML = files.map((f, idx) => `<span class="file-chip">${escapeHtml(f.name)} (${escapeHtml(f.extractionStatus || 'saved')}) <button class="btn" style="padding:2px 6px" type="button" data-remove-file="${key}|${idx}">x</button></span>`).join('');
  root.querySelectorAll('[data-remove-file]').forEach((btn) => {
    btn.onclick = () => {
      const [k, i] = btn.dataset.removeFile.split('|');
      files.splice(Number(i), 1);
      refreshFileList(root, k, files);
    };
  });
}

function renderAddForm(item = null) {
  const root = document.getElementById('view-add');
  const isEdit = Boolean(item);
  const cur = item || normalizeItem({ type: state.addPrefillType });
  root.innerHTML = `
    <div class="card">
      <h3>${isEdit ? 'Edit Item' : 'Add New Item'}</h3>
      <form id="item-form">
        <div class="form-grid">
          <div><label>Title *</label><input required name="title" value="${escapeHtml(cur.title === 'Untitled' ? '' : cur.title)}"></div>
          <div><label>Class Name *</label><input required name="className" value="${escapeHtml(cur.className === 'General' ? '' : cur.className)}"></div>
          <div><label>Professor</label><input name="professor" value="${escapeHtml(cur.professor)}"></div>
          <div>
            <label>Type *</label>
            <select name="type">
              ${TYPE_OPTIONS.map((type) => `<option value="${type}" ${cur.type === type ? 'selected' : ''}>${TYPE_META[type].label}</option>`).join('')}
            </select>
          </div>
          <div><label>Due Date *</label><input required type="date" name="dueDate" value="${cur.dueDate}"></div>
          <div><label>Priority</label><select name="priority"><option value="low" ${cur.priority === 'low' ? 'selected' : ''}>Low</option><option value="medium" ${cur.priority === 'medium' ? 'selected' : ''}>Medium</option><option value="high" ${cur.priority === 'high' ? 'selected' : ''}>High</option></select></div>
        </div>

        ${renderSectionEditor('topics', 'Topics / Study Guide Topics', cur)}
        ${renderSectionEditor('homework', 'Homework Problems / Sets', cur)}
        ${renderSectionEditor('classPractice', 'Class Practice / Review Sheet Questions', cur)}
        ${renderSectionEditor('weakAreas', 'Weak Areas', cur)}
        ${renderSectionEditor('vocab', 'Vocab / Terms / Formulas', cur)}
        ${renderSectionEditor('notes', 'Notes', cur)}

        <label>General Notes</label>
        <textarea name="notes">${escapeHtml(cur.notes)}</textarea>

        <div class="actions" style="margin-top:10px">
          <button class="btn primary" type="submit">${isEdit ? 'Save Changes' : 'Save Item'}</button>
          <button class="btn" type="button" data-act="cancel-add">Cancel</button>
        </div>
      </form>
    </div>
  `;

  const draft = structuredClone(cur.studyInputs);

  root.querySelectorAll('[data-upload-key]').forEach((input) => {
    input.addEventListener('change', async (ev) => {
      const files = Array.from(ev.target.files || []);
      const key = ev.target.dataset.uploadKey;
      const statusEl = root.querySelector(`[data-upload-status='${key}']`);
      const textEl = root.querySelector(`[name='study_${key}']`);

      for (const file of files) {
        statusEl.textContent = `Uploading ${file.name}...`;
        const entry = { name: file.name, type: file.type || 'unknown', extractionStatus: 'pending', extractionMessage: '' };

        if (file.name.toLowerCase().endsWith('.txt')) {
          const txt = await file.text();
          entry.extractionStatus = 'success';
          entry.extractionMessage = 'Text extracted successfully.';
          draft[key].text = `${draft[key].text}\n${txt}`.trim();
          textEl.value = draft[key].text;
        } else if (file.name.toLowerCase().endsWith('.pdf')) {
          statusEl.textContent = `Extracting text from ${file.name}...`;
          const res = await extractPdfText(file);
          entry.extractionStatus = res.status;
          entry.extractionMessage = res.message;
          if (res.text) {
            draft[key].text = `${draft[key].text}\n${res.text}`.trim();
            textEl.value = draft[key].text;
          }
        } else {
          entry.extractionStatus = 'warning';
          entry.extractionMessage = 'Unsupported file type. Use PDF or TXT.';
        }

        draft[key].files.push(entry);
      }

      statusEl.textContent = 'Upload complete.';
      refreshFileList(root, key, draft[key].files);
      ev.target.value = '';
    });
  });

  root.querySelectorAll('[data-remove-file]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [key, idx] = btn.dataset.removeFile.split('|');
      draft[key].files.splice(Number(idx), 1);
      refreshFileList(root, key, draft[key].files);
    });
  });

  root.querySelector('#item-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = normalizeItem({
      ...cur,
      id: cur.id,
      title: String(fd.get('title')).trim(),
      className: String(fd.get('className')).trim(),
      professor: String(fd.get('professor')).trim(),
      type: normalizeType(String(fd.get('type'))),
      dueDate: String(fd.get('dueDate')),
      priority: String(fd.get('priority')),
      notes: String(fd.get('notes')).trim(),
      studyInputs: SECTION_KEYS.reduce((acc, key) => {
        acc[key] = { text: String(fd.get(`study_${key}`) || ''), files: draft[key].files };
        return acc;
      }, {}),
    });
    upsertItem(next);
    state.addPrefillType = next.type;
    switchView('dashboard');
  });

  root.querySelector('[data-act="cancel-add"]').addEventListener('click', () => switchView('dashboard'));
}

function renderCalendar() {
  const root = document.getElementById('view-calendar');
  const cursor = state.monthCursor;
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startDay = monthStart.getDay();
  const gridStart = addDays(monthStart, -startDay);
  const allEvents = state.items.flatMap((i) => i.calendarEvents.map((e) => ({ ...e, itemId: i.id, itemType: i.type })));

  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const day = addDays(gridStart, i);
    const date = day.toISOString().slice(0, 10);
    const events = allEvents.filter((e) => e.date === date).slice(0, 3);
    cells.push(`<div class="day"><h4>${day.getDate()}</h4>${events.map((e) => `<div class="event ${TYPE_META[e.itemType].className}" data-item="${e.itemId}">${escapeHtml(e.title)}</div>`).join('')}</div>`);
  }

  root.innerHTML = `
    <div class="card">
      <div class="actions" style="justify-content:space-between;align-items:center;margin-bottom:10px">
        <button class="btn" data-act="month-prev">←</button>
        <h3 style="margin:0">${cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <button class="btn" data-act="month-next">→</button>
      </div>
      <div class="calendar">${cells.join('')}</div>
      <div class="card" style="margin-top:10px">
        <h4>Upcoming Events</h4>
        <div class="list">
          ${allEvents.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10).map((e) => `<div class="card clickable" data-item="${e.itemId}">${e.date} • ${escapeHtml(e.title)}</div>`).join('') || '<p class="helper">Your calendar will fill automatically once you create a plan.</p>'}
        </div>
      </div>
    </div>
  `;
}

function renderClasses() {
  const root = document.getElementById('view-classes');
  const groups = {};
  for (const item of state.items) {
    groups[item.className] = groups[item.className] || [];
    groups[item.className].push(item);
  }
  const names = Object.keys(groups).sort();
  root.innerHTML = `
    <div class="card">
      <h3>By Class</h3>
      ${names.length ? names.map((name) => `
        <div class="card" style="margin-top:10px">
          <b>${escapeHtml(name)}</b>
          <div class="list" style="margin-top:8px">
            ${groups[name].map((i) => `<div class="card clickable" data-item="${i.id}"><b>${escapeHtml(i.title)}</b> ${typeBadge(i.type)}<p class="helper">Due ${i.dueDate}</p></div>`).join('')}
          </div>
        </div>
      `).join('') : '<p class="helper">Add your first item to generate a smart plan.</p>'}
    </div>
  `;
}

function studyModesByType(type) {
  if (type === 'exam') return [['plan', 'Topic Study Plan'], ['practice', 'Practice Questions'], ['flashcards', 'Flashcards'], ['quiz', 'Quiz']];
  if (type === 'problem_set') return [['plan', 'Problem Workflow'], ['practice', 'Problem Practice']];
  if (type === 'essay') return [['plan', 'Writing Timeline'], ['review', 'Rubric Checklist']];
  if (type === 'project') return [['plan', 'Milestones'], ['review', 'Deliverables']];
  if (type === 'vocab') return [['plan', 'Memorization Plan'], ['flashcards', 'Flashcards'], ['quiz', 'Quiz']];
  return [['plan', 'Presentation Plan'], ['review', 'Rehearsal Checklist']];
}

function renderPlanBlock(item) {
  if (item.generatedPlan?.studyDays) {
    return `<div class="list">${item.generatedPlan.studyDays.map((s) => `<div class="card"><b>${s.date}</b> • ${escapeHtml(s.topic)} <span class="badge">${escapeHtml(s.duration)}</span><p class="helper">${escapeHtml(s.description)}${s.label ? ` • ${escapeHtml(s.label)}` : ''}</p></div>`).join('')}</div>`;
  }
  if (item.generatedPlan?.steps) {
    return `<div class="list">${item.generatedPlan.steps.map((s) => `<div class="card"><b>${s.date}</b> • ${escapeHtml(s.title)} <span class="badge">${escapeHtml(s.duration)}</span><p class="helper">${escapeHtml(s.description)}</p></div>`).join('')}</div>`;
  }
  return '<p class="helper">No generated plan yet.</p>';
}

function renderReviewBlock(item) {
  const checklist = item.generatedPlan?.checklist || [];
  const warnings = item.generatedPlan?.warnings || [];
  const extras = item.generatedPlan?.formulasToReview || [];
  return `
    <div class="list">
      ${checklist.length ? `<div class="card"><b>Checklist</b><ul>${checklist.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul></div>` : ''}
      ${extras.length ? `<div class="card"><b>Key formulas / concepts to review</b><p>${escapeHtml(extras.join(', '))}</p></div>` : ''}
      ${warnings.length ? `<div class="card"><b>Warnings</b><ul>${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>` : '<p class="helper">No current warnings.</p>'}
    </div>
  `;
}

function renderStudyMode(item) {
  if (state.studyMode === 'practice') {
    if (!item.practiceQuestions.length) return '<p class="helper">No practice set for this item type.</p>';
    return `<div class="list">${item.practiceQuestions.map((q, i) => `<div class="card"><b>Q${i + 1}.</b> ${escapeHtml(q.q)}<p class="helper">${escapeHtml(q.a)}</p></div>`).join('')}</div>`;
  }

  if (state.studyMode === 'flashcards') {
    const cards = item.flashcards;
    if (!cards.length) return '<p class="helper">No flashcards available yet.</p>';
    const idx = Math.min(state.flashcardIndex, cards.length - 1);
    const card = cards[idx];
    const masteryTotal = item.mastery.know + item.mastery.studyAgain;
    const pct = masteryTotal ? Math.round((item.mastery.know / masteryTotal) * 100) : 0;
    return `
      <div class="card clickable" data-act="flip-card"><h4>${state.flashcardFlipped ? 'Back' : 'Front'}</h4><p>${escapeHtml(state.flashcardFlipped ? card.back : card.front)}</p></div>
      <div class="actions" style="margin-top:8px">
        <button class="btn" data-act="card-prev">Previous</button>
        <button class="btn" data-act="card-next">Next</button>
        <button class="btn" data-act="card-shuffle">Shuffle</button>
        <button class="btn" data-act="mark-know">Mastered</button>
        <button class="btn" data-act="mark-again">Study again</button>
      </div>
      <p class="helper">Card ${idx + 1} / ${cards.length}</p>
      <div class="progress"><span style="width:${pct}%"></span></div>
    `;
  }

  if (state.studyMode === 'quiz') {
    if (!item.quiz.length) return '<p class="helper">No quiz available for this item type.</p>';
    return `<div class="list">${item.quiz.map((q, i) => `<div class="card"><b>${i + 1}. ${escapeHtml(q.prompt)}</b><div class="list">${q.options.map((o) => `<button class="btn" data-answer="${i}|${escapeHtml(o)}">${escapeHtml(o)}</button>`).join('')}</div><p class="helper">Answer: ${escapeHtml(q.answer)}</p></div>`).join('')}</div>`;
  }

  if (state.studyMode === 'review') return renderReviewBlock(item);
  return renderPlanBlock(item);
}

function renderStudyTools() {
  const root = document.getElementById('view-study');
  const selected = state.items.find((i) => i.id === state.selectedStudyItemId) || state.items[0] || null;
  state.selectedStudyItemId = selected?.id || null;

  if (!selected) {
    root.innerHTML = `<div class="card"><h3>Study Tools</h3><p class="helper">Select an item to begin.</p><button class="btn primary" data-act="goto-add">+ Add New</button></div>`;
    return;
  }

  const selector = `<select id="study-item-select">${state.items.map((i) => `<option value="${i.id}" ${selected?.id === i.id ? 'selected' : ''}>${escapeHtml(i.title)} (${TYPE_META[i.type].label})</option>`).join('')}</select>`;
  const modes = studyModesByType(selected.type);
  if (!modes.find(([k]) => k === state.studyMode)) state.studyMode = modes[0][0];

  root.innerHTML = `
    <div class="card">
      <h3>Study Tools</h3>
      ${selector}
      <div class="tabs">${modes.map(([k, label]) => `<button class="btn ${state.studyMode === k ? 'primary' : ''}" data-mode="${k}">${label}</button>`).join('')}</div>
      <div id="study-panel">${renderStudyMode(selected)}</div>
    </div>
  `;
}

function openModal(itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return;

  const modal = document.getElementById('item-modal');
  const body = document.getElementById('modal-content');
  body.innerHTML = `
    <div class="modal-head"><h3>${escapeHtml(item.title)}</h3><button class="btn" data-act="close-modal">Close</button></div>
    <p class="helper">${escapeHtml(item.className)} • ${TYPE_META[item.type].label} • due ${item.dueDate} • priority ${item.priority}</p>
    <div class="tabs">
      <button class="btn primary" data-modal-tab="overview">Overview</button>
      <button class="btn" data-modal-tab="timeline">Timeline</button>
      <button class="btn" data-modal-tab="materials">Materials</button>
      <button class="btn" data-modal-tab="study">Study</button>
    </div>
    <div id="modal-tab-content"></div>
    <div class="actions" style="margin-top:12px"><button class="btn" data-act="edit-item" data-id="${item.id}">Edit</button><button class="btn" data-act="delete-item" data-id="${item.id}">Delete</button></div>
  `;

  function renderModalTab(tab) {
    const target = body.querySelector('#modal-tab-content');
    if (tab === 'timeline') {
      target.innerHTML = `<div class="list">${item.calendarEvents.map((e) => `<div class="card">${e.date} • ${escapeHtml(e.title)}</div>`).join('')}</div>`;
      return;
    }
    if (tab === 'materials') {
      target.innerHTML = SECTION_KEYS.map((k) => {
        const sec = item.studyInputs[k];
        return `<div class="card"><b>${escapeHtml(k)}</b><p class="helper">${escapeHtml(sec.text.slice(0, 500) || 'No text yet.')}</p><div class="file-list">${sec.files.map((f) => `<span class="file-chip">${escapeHtml(f.name)} (${escapeHtml(f.extractionStatus || 'saved')})</span>`).join('')}</div></div>`;
      }).join('');
      return;
    }
    if (tab === 'study') {
      target.innerHTML = `<div class="list"><div class="card"><b>Plan Highlights</b>${renderPlanBlock(item)}</div><div class="card"><b>Workflow Checklist</b>${renderReviewBlock(item)}</div></div>`;
      return;
    }
    target.innerHTML = `<div class="card"><p>${escapeHtml(item.notes || 'No notes added.')}</p></div>`;
  }

  renderModalTab('overview');
  body.querySelectorAll('[data-modal-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('[data-modal-tab]').forEach((b) => b.classList.remove('primary'));
      btn.classList.add('primary');
      renderModalTab(btn.dataset.modalTab);
    });
  });

  modal.showModal();
}

function closeModal() {
  const modal = document.getElementById('item-modal');
  if (modal.open) modal.close();
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) return { status: 'error', message: 'PDF engine unavailable. Refresh and try again.', text: '' };
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n += 1) {
      try {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const txt = content.items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim();
        if (txt) pages.push(`[Page ${n}] ${txt}`);
      } catch (error) {
        console.warn('PDF page parse failed', n, error);
      }
    }
    const text = pages.join('\n\n').trim();
    if (text.replace(/\s/g, '').length < 40) {
      return { status: 'likely_scanned', message: 'This PDF may be scanned or image-based, so no selectable text was found. Try a text-based PDF or paste notes manually.', text: '' };
    }
    return { status: 'success', message: 'PDF text extracted successfully.', text };
  } catch (error) {
    console.warn('extractPdfText failed', error);
    return { status: 'error', message: 'Could not extract text from this PDF.', text: '' };
  }
}

function wireGlobalHandlers() {
  document.getElementById('top-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    switchView(btn.dataset.view);
  });

  document.body.addEventListener('click', (e) => {
    const target = e.target;
    const action = target.closest('[data-act]')?.dataset.act;
    const itemId = target.closest('[data-item]')?.dataset.item;
    if (itemId) { openModal(itemId); return; }

    if (action === 'goto-add') { state.addPrefillType = 'exam'; switchView('add'); return; }
    if (action === 'goto-calendar') { switchView('calendar'); return; }
    if (action === 'close-modal') { closeModal(); return; }
    if (action === 'cancel-add') { switchView('dashboard'); return; }
    if (action === 'quick-add') {
      state.addPrefillType = normalizeType(target.dataset.type);
      switchView('add');
      return;
    }
    if (action === 'edit-item') {
      const item = state.items.find((i) => i.id === target.dataset.id);
      if (!item) return;
      switchView('add');
      renderAddForm(item);
      closeModal();
      return;
    }
    if (action === 'delete-item') {
      if (confirm('Delete this item?')) deleteItem(target.dataset.id);
      return;
    }
    if (action === 'month-prev') { state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1); renderCalendar(); return; }
    if (action === 'month-next') { state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1); renderCalendar(); return; }

    if (action === 'flip-card') { state.flashcardFlipped = !state.flashcardFlipped; renderStudyTools(); return; }
    if (action === 'card-prev') { state.flashcardIndex = Math.max(0, state.flashcardIndex - 1); state.flashcardFlipped = false; renderStudyTools(); return; }
    if (action === 'card-next') {
      const item = state.items.find((i) => i.id === state.selectedStudyItemId);
      state.flashcardIndex = Math.min((item?.flashcards.length || 1) - 1, state.flashcardIndex + 1);
      state.flashcardFlipped = false;
      renderStudyTools();
      return;
    }
    if (action === 'card-shuffle') {
      const item = state.items.find((i) => i.id === state.selectedStudyItemId);
      if (!item) return;
      item.flashcards.sort(() => Math.random() - 0.5);
      upsertItem(item);
      return;
    }
    if (action === 'mark-know' || action === 'mark-again') {
      const item = state.items.find((i) => i.id === state.selectedStudyItemId);
      if (!item) return;
      if (action === 'mark-know') item.mastery.know += 1;
      else item.mastery.studyAgain += 1;
      upsertItem(item);
      return;
    }
  });

  document.body.addEventListener('change', (e) => {
    if (e.target.id === 'study-item-select') {
      state.selectedStudyItemId = e.target.value;
      state.studyMode = 'plan';
      state.flashcardIndex = 0;
      state.flashcardFlipped = false;
      renderStudyTools();
    }
  });

  document.body.addEventListener('click', (e) => {
    const mode = e.target.closest('[data-mode]')?.dataset.mode;
    if (!mode) return;
    state.studyMode = mode;
    renderStudyTools();
  });
}

function render() {
  renderDashboard();
  renderCalendar();
  renderClasses();
  renderStudyTools();
}

function initPdfWorker() {
  if (!window.pdfjsLib) return;
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;
}

function init() {
  load();
  initPdfWorker();
  wireGlobalHandlers();
  render();
  switchView('dashboard');
}

window.addEventListener('DOMContentLoaded', init);
