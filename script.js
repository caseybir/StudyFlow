'use strict';

const STORAGE_KEY = 'studyflow_v3';
const PDFJS_VERSION = '4.3.136';
const SECTION_KEYS = ['topics', 'homework', 'classPractice', 'weakAreas', 'vocab', 'notes'];

const state = {
  items: [],
  view: 'dashboard',
  monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedStudyItemId: null,
  studyMode: 'plan',
  flashcardIndex: 0,
  flashcardFlipped: false,
};

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeJsonParse(v, fallback) {
  try { return JSON.parse(v); } catch { return fallback; }
}

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items })); }

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
    type: ['exam', 'project', 'assignment'].includes(raw.type) ? raw.type : 'exam',
    dueDate: raw.dueDate || new Date().toISOString().slice(0, 10),
    priority: raw.priority || 'medium',
    notes: raw.notes || '',
    difficulty: raw.difficulty || 'medium',
    estimatedHours: Number(raw.estimatedHours || 6),
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

function inferTopics(item) {
  const explicit = item.studyInputs.topics.text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const blob = SECTION_KEYS.map((k) => item.studyInputs[k].text).join(' ').toLowerCase();
  const words = blob.match(/[a-z][a-z0-9\-]{3,}/g) || [];
  const stop = new Set(['this', 'that', 'with', 'from', 'have', 'into', 'your', 'using', 'should', 'about', 'where', 'when', 'what']);
  const freq = {};
  for (const w of words) {
    if (stop.has(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  const inferred = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, weight: count }));
  if (explicit.length) {
    return explicit.map((name, i) => ({ name, weight: explicit.length - i + 2 }));
  }
  return inferred.length ? inferred : [{ name: 'Core concepts', weight: 4 }, { name: 'Practice problems', weight: 3 }];
}

function addDays(d, days) {
  const t = new Date(d);
  t.setDate(t.getDate() + days);
  return t;
}

function toDate(s) { return new Date(`${s}T00:00:00`); }

function generateExamPlan(item) {
  const due = toDate(item.dueDate);
  const daysLeft = Math.max(2, Math.ceil((due - new Date()) / 86400000));
  const topics = inferTopics(item);
  const weak = (item.studyInputs.weakAreas.text || '').toLowerCase();
  const sorted = topics.map((t) => ({
    ...t,
    score: t.weight + (weak.includes(t.name.toLowerCase()) ? 3 : 0),
  })).sort((a, b) => b.score - a.score);
  const studyDays = Math.min(10, Math.max(3, daysLeft - 1));
  const start = addDays(due, -studyDays);
  const sessions = [];
  for (let i = 0; i < studyDays; i += 1) {
    const d = addDays(start, i);
    const t = sorted[i % sorted.length];
    const mins = 45 + Math.min(60, t.score * 8);
    sessions.push({
      date: d.toISOString().slice(0, 10),
      topic: t.name,
      duration: `${Math.round(mins / 15) * 15} min`,
      description: `Study ${t.name}, then complete focused practice.`
    });
    if (i > 1 && i % 3 === 0) {
      sessions.push({
        date: d.toISOString().slice(0, 10),
        topic: 'Review block',
        duration: '30 min',
        description: 'Review mistakes and recall earlier topics.'
      });
    }
  }
  sessions.push({ date: addDays(due, -1).toISOString().slice(0, 10), topic: 'Final review', duration: '90 min', description: 'Mixed review + confidence pass.' });
  return { type: 'exam', startDate: start.toISOString().slice(0, 10), studyDays: sessions };
}

function generateProjectPlan(item) {
  const due = toDate(item.dueDate);
  const start = addDays(due, -8);
  const steps = [
    ['Requirements + scope', '75 min'],
    ['Research + outline', '120 min'],
    ['Build first draft', '180 min'],
    ['Refine implementation', '120 min'],
    ['Polish + final check', '60 min'],
  ].map((s, i) => ({ date: addDays(start, i * 2).toISOString().slice(0, 10), title: s[0], duration: s[1], description: `${s[0]} for ${item.title}.` }));
  return { type: 'project', startDate: start.toISOString().slice(0, 10), steps };
}

function generateAssignmentPlan(item) {
  const due = toDate(item.dueDate);
  const start = addDays(due, -5);
  const steps = [
    ['Understand prompt + deliverables', '30 min'],
    ['Gather sources/materials', '45 min'],
    ['Create structure / outline', '45 min'],
    ['Complete main work', '90 min'],
    ['Edit + submit check', '45 min'],
  ].map((s, i) => ({ date: addDays(start, i).toISOString().slice(0, 10), title: s[0], duration: s[1], description: s[0] }));
  return { type: 'assignment', startDate: start.toISOString().slice(0, 10), steps };
}

function generatePracticeQuestions(item) {
  const src = `${item.studyInputs.homework.text}\n${item.studyInputs.classPractice.text}`;
  const lines = src.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6);
  if (lines.length) return lines.map((q, i) => ({ q: `Practice ${i + 1}: ${q}`, a: 'Explain your reasoning and verify with notes.' }));
  return inferTopics(item).slice(0, 5).map((t) => ({ q: `Explain ${t.name} and solve one example problem.`, a: `Define ${t.name}, show steps, and check errors.` }));
}

function generateFlashcards(item) {
  const rows = item.studyInputs.vocab.text.split('\n').map((r) => r.trim()).filter(Boolean);
  const cards = [];
  for (const row of rows) {
    const [front, back] = row.split(/[:\-]/).map((x) => x?.trim()).filter(Boolean);
    if (front && back) cards.push({ front, back });
  }
  if (cards.length) return cards;
  return inferTopics(item).slice(0, 8).map((t) => ({ front: `Define: ${t.name}`, back: `${t.name} explained in your own words + one example.` }));
}

function generateQuiz(item) {
  return generateFlashcards(item).slice(0, 6).map((c) => ({
    prompt: c.front,
    answer: c.back,
    options: [c.back, 'Not sure yet', 'Review later', 'Skip this for now'].sort(() => Math.random() - 0.5),
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
  if (!next.generatedPlan) {
    next.generatedPlan = next.type === 'exam' ? generateExamPlan(next) : next.type === 'project' ? generateProjectPlan(next) : generateAssignmentPlan(next);
  }
  if (!next.practiceQuestions.length && next.type === 'exam') next.practiceQuestions = generatePracticeQuestions(next);
  if (!next.flashcards.length && next.type === 'exam') next.flashcards = generateFlashcards(next);
  if (!next.quiz.length && next.type === 'exam') next.quiz = generateQuiz(next);
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

function renderDashboard() {
  const root = document.getElementById('view-dashboard');
  const upcoming = [...state.items].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);
  const today = new Date().toISOString().slice(0, 10);
  const allEvents = state.items.flatMap((i) => i.calendarEvents.map((e) => ({ ...e, item: i })));
  const todayEvents = allEvents.filter((e) => e.date === today && e.kind === 'session').slice(0, 5);
  const nextAction = allEvents.filter((e) => e.kind === 'session').sort((a, b) => a.date.localeCompare(b.date))[0];
  const exams = state.items.filter((i) => i.type === 'exam' && i.dueDate >= today).length;
  const assignments = state.items.filter((i) => i.type === 'assignment' && i.dueDate >= today).length;
  const weekCutoff = addDays(new Date(), 7).toISOString().slice(0, 10);
  const dueWeek = state.items.filter((i) => i.dueDate >= today && i.dueDate <= weekCutoff).length;

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
    <div class="metrics">
      <div class="metric"><label>Upcoming Exams</label><b>${exams}</b></div>
      <div class="metric"><label>Upcoming Assignments</label><b>${assignments}</b></div>
      <div class="metric"><label>Due This Week</label><b>${dueWeek}</b></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3 class="section-title">Next Study Action</h3>
        ${nextAction ? `<div class="card clickable" data-item="${nextAction.itemId}"><b>${nextAction.title}</b><p class="helper">For ${nextAction.item.title} (${nextAction.date})</p></div>` : '<p class="helper">Your next study action will appear here.</p>'}
      </div>
      <div class="card">
        <h3 class="section-title">Today’s Plan</h3>
        <div class="list">
          ${todayEvents.length ? todayEvents.map((e) => `<div class="card clickable" data-item="${e.itemId}">${e.title}</div>`).join('') : '<p class="helper">No study sessions scheduled yet.</p>'}
        </div>
      </div>
    </div>
    <div class="grid-2" style="margin-top:14px">
      <div class="card">
        <h3 class="section-title">Upcoming Deadlines</h3>
        <div class="list">
          ${upcoming.length ? upcoming.map((i) => `<div class="card clickable" data-item="${i.id}"><b>${i.title}</b> <span class="badge ${i.type}">${i.type}</span><p class="helper">${i.className} • due ${i.dueDate}</p></div>`).join('') : '<p class="helper">No upcoming deadlines yet.</p>'}
        </div>
      </div>
      <div class="card">
        <h3 class="section-title">Risk Warnings</h3>
        <div class="list">
          ${upcoming.filter((i) => i.priority === 'high').slice(0, 4).map((i) => `<div class="card clickable" data-item="${i.id}">High priority: ${i.title}</div>`).join('') || '<p class="helper">No major risks detected right now.</p>'}
        </div>
      </div>
    </div>
  `;
}

function renderAddForm(item = null) {
  const root = document.getElementById('view-add');
  const isEdit = Boolean(item);
  const cur = item || normalizeItem({});
  root.innerHTML = `
    <div class="card">
      <h3>${isEdit ? 'Edit Item' : 'Add New Item'}</h3>
      <form id="item-form">
        <div class="form-grid">
          <div><label>Title *</label><input required name="title" value="${escapeHtml(cur.title === 'Untitled' ? '' : cur.title)}"></div>
          <div><label>Class Name *</label><input required name="className" value="${escapeHtml(cur.className === 'General' ? '' : cur.className)}"></div>
          <div><label>Professor</label><input name="professor" value="${escapeHtml(cur.professor)}"></div>
          <div><label>Type *</label><select name="type"><option value="exam" ${cur.type === 'exam' ? 'selected' : ''}>Exam</option><option value="project" ${cur.type === 'project' ? 'selected' : ''}>Project</option><option value="assignment" ${cur.type === 'assignment' ? 'selected' : ''}>Assignment</option></select></div>
          <div><label>Due Date *</label><input required type="date" name="dueDate" value="${cur.dueDate}"></div>
          <div><label>Priority</label><select name="priority"><option value="low" ${cur.priority === 'low' ? 'selected' : ''}>Low</option><option value="medium" ${cur.priority === 'medium' ? 'selected' : ''}>Medium</option><option value="high" ${cur.priority === 'high' ? 'selected' : ''}>High</option></select></div>
        </div>

        ${renderSectionEditor('topics', 'Topics / Study Guide Topics', cur)}
        ${renderSectionEditor('homework', 'Homework Problems / Sets', cur)}
        ${renderSectionEditor('classPractice', 'Class Practice / Review Questions', cur)}
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
      const statusMessages = [];
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
        statusMessages.push(`${file.name}: ${entry.extractionMessage}`);
      }
      statusEl.textContent = statusMessages.join(' | ') || 'Upload complete.';
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
      type: String(fd.get('type')),
      dueDate: String(fd.get('dueDate')),
      priority: String(fd.get('priority')),
      notes: String(fd.get('notes')).trim(),
      studyInputs: SECTION_KEYS.reduce((acc, key) => {
        acc[key] = { text: String(fd.get(`study_${key}`) || ''), files: draft[key].files };
        return acc;
      }, {}),
    });
    upsertItem(next);
    switchView('dashboard');
  });

  root.querySelector('[data-act="cancel-add"]').addEventListener('click', () => switchView('dashboard'));
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
        ${sec.files.map((f, idx) => `<span class="file-chip">${escapeHtml(f.name)} (${f.extractionStatus || 'saved'}) <button class="btn" style="padding:2px 6px" type="button" data-remove-file="${key}|${idx}">x</button></span>`).join('')}
      </div>
    </div>
  `;
}

function refreshFileList(root, key, files) {
  root.querySelector(`[data-file-list='${key}']`).innerHTML = files.map((f, idx) => `<span class="file-chip">${escapeHtml(f.name)} (${escapeHtml(f.extractionStatus || 'saved')}) <button class="btn" style="padding:2px 6px" type="button" data-remove-file="${key}|${idx}">x</button></span>`).join('');
  root.querySelectorAll('[data-remove-file]').forEach((btn) => {
    btn.onclick = () => {
      const [k, i] = btn.dataset.removeFile.split('|');
      files.splice(Number(i), 1);
      refreshFileList(root, k, files);
    };
  });
}

function renderCalendar() {
  const root = document.getElementById('view-calendar');
  const cursor = state.monthCursor;
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startDay = monthStart.getDay();
  const gridStart = addDays(monthStart, -startDay);
  const allEvents = state.items.flatMap((i) => i.calendarEvents.map((e) => ({ ...e, itemId: i.id })));

  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const day = addDays(gridStart, i);
    const date = day.toISOString().slice(0, 10);
    const events = allEvents.filter((e) => e.date === date).slice(0, 3);
    cells.push(`<div class="day" data-date="${date}"><h4>${day.getDate()}</h4>${events.map((e) => `<div class="event ${e.type}" data-item="${e.itemId}">${escapeHtml(e.title)}</div>`).join('')}</div>`);
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
          ${allEvents.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8).map((e) => `<div class="card clickable" data-item="${e.itemId}">${e.date} • ${escapeHtml(e.title)}</div>`).join('') || '<p class="helper">Your calendar will fill automatically once you create a plan.</p>'}
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
            ${groups[name].map((i) => `<div class="card clickable" data-item="${i.id}">${escapeHtml(i.title)} <span class="badge ${i.type}">${i.type}</span><p class="helper">Due ${i.dueDate}</p></div>`).join('')}
          </div>
        </div>
      `).join('') : '<p class="helper">Add your first exam or assignment to generate a study plan.</p>'}
    </div>
  `;
}

function renderStudyTools() {
  const root = document.getElementById('view-study');
  const selected = state.items.find((i) => i.id === state.selectedStudyItemId) || state.items[0] || null;
  state.selectedStudyItemId = selected?.id || null;
  const selector = `<select id="study-item-select">${state.items.map((i) => `<option value="${i.id}" ${selected?.id === i.id ? 'selected' : ''}>${escapeHtml(i.title)} (${i.type})</option>`).join('')}</select>`;
  if (!selected) {
    root.innerHTML = `<div class="card"><h3>Study Tools</h3><p class="helper">Select an item to begin.</p><button class="btn primary" data-act="goto-add">+ Add New</button></div>`;
    return;
  }

  const modes = selected.type === 'exam'
    ? [['plan', 'Daily Study Plan'], ['practice', 'Practice Questions'], ['flashcards', 'Flashcards'], ['quiz', 'Quiz']]
    : [['plan', selected.type === 'project' ? 'Work Timeline' : 'Step Breakdown']];

  root.innerHTML = `
    <div class="card">
      <h3>Study Tools</h3>
      ${selector}
      <div class="tabs">${modes.map(([k, label]) => `<button class="btn ${state.studyMode === k ? 'primary' : ''}" data-mode="${k}">${label}</button>`).join('')}</div>
      <div id="study-panel">${renderStudyMode(selected)}</div>
    </div>
  `;
}

function renderStudyMode(item) {
  if (state.studyMode === 'practice') {
    return `<div class="list">${item.practiceQuestions.map((q, i) => `<div class="card"><b>Q${i + 1}.</b> ${escapeHtml(q.q)}<p class="helper">${escapeHtml(q.a)}</p></div>`).join('')}</div>`;
  }
  if (state.studyMode === 'flashcards') {
    const cards = item.flashcards;
    if (!cards.length) return '<p class="helper">No flashcards available yet.</p>';
    const idx = Math.min(state.flashcardIndex, cards.length - 1);
    const card = cards[idx];
    const mastery = item.mastery.know + item.mastery.studyAgain;
    const pct = mastery ? Math.round((item.mastery.know / mastery) * 100) : 0;
    return `
      <div class="card clickable" data-act="flip-card"><h4>${state.flashcardFlipped ? 'Back' : 'Front'}</h4><p>${escapeHtml(state.flashcardFlipped ? card.back : card.front)}</p></div>
      <div class="actions" style="margin-top:8px">
        <button class="btn" data-act="card-prev">Previous</button>
        <button class="btn" data-act="card-next">Next</button>
        <button class="btn" data-act="card-shuffle">Shuffle</button>
        <button class="btn" data-act="mark-know">Know it</button>
        <button class="btn" data-act="mark-again">Study again</button>
      </div>
      <p class="helper">Card ${idx + 1} / ${cards.length}</p>
      <div class="progress"><span style="width:${pct}%"></span></div>
    `;
  }
  if (state.studyMode === 'quiz') {
    return `<div class="list">${item.quiz.map((q, i) => `<div class="card"><b>${i + 1}. ${escapeHtml(q.prompt)}</b><div class="list">${q.options.map((o) => `<button class="btn" data-answer="${i}|${escapeHtmlAttr(o)}">${escapeHtml(o)}</button>`).join('')}</div><p class="helper">Answer: ${escapeHtml(q.answer)}</p></div>`).join('')}</div>`;
  }

  if (item.generatedPlan?.studyDays) {
    return `<div class="list">${item.generatedPlan.studyDays.map((s) => `<div class="card"><b>${s.date}</b> • ${escapeHtml(s.topic)} <span class="badge">${escapeHtml(s.duration)}</span><p class="helper">${escapeHtml(s.description)}</p></div>`).join('')}</div>`;
  }
  if (item.generatedPlan?.steps) {
    return `<div class="list">${item.generatedPlan.steps.map((s) => `<div class="card"><b>${s.date}</b> • ${escapeHtml(s.title)} <span class="badge">${escapeHtml(s.duration)}</span><p class="helper">${escapeHtml(s.description)}</p></div>`).join('')}</div>`;
  }
  return '<p class="helper">No generated plan yet.</p>';
}

function openModal(itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return;
  const modal = document.getElementById('item-modal');
  const body = document.getElementById('modal-content');
  body.innerHTML = `
    <div class="modal-head"><h3>${escapeHtml(item.title)}</h3><button class="btn" data-act="close-modal">Close</button></div>
    <p class="helper">${item.className} • ${item.type} • due ${item.dueDate} • priority ${item.priority}</p>
    <div class="tabs">
      <button class="btn primary" data-modal-tab="overview">Overview</button>
      <button class="btn" data-modal-tab="timeline">Timeline</button>
      <button class="btn" data-modal-tab="materials">Materials</button>
      <button class="btn" data-modal-tab="study">Study</button>
    </div>
    <div id="modal-tab-content"></div>
    <div class="actions" style="margin-top:12px"><button class="btn" data-act="edit-item" data-id="${item.id}">Edit</button><button class="btn" data-act="delete-item" data-id="${item.id}">Delete</button></div>
  `;
  const renderTab = (tab) => {
    const target = body.querySelector('#modal-tab-content');
    if (tab === 'timeline') {
      target.innerHTML = `<div class="list">${item.calendarEvents.map((e) => `<div class="card">${e.date} • ${escapeHtml(e.title)}</div>`).join('')}</div>`;
    } else if (tab === 'materials') {
      target.innerHTML = SECTION_KEYS.map((k) => {
        const sec = item.studyInputs[k];
        return `<div class="card"><b>${k}</b><p class="helper">${escapeHtml(sec.text.slice(0, 700) || 'No text yet.')}</p><div class="file-list">${sec.files.map((f) => `<span class="file-chip">${escapeHtml(f.name)} (${escapeHtml(f.extractionStatus || 'saved')})</span>`).join('')}</div></div>`;
      }).join('');
    } else if (tab === 'study') {
      target.innerHTML = `<div class="card"><b>Practice questions</b>${item.practiceQuestions.map((q) => `<p>${escapeHtml(q.q)}</p>`).join('') || '<p class="helper">None yet.</p>'}</div>`;
    } else {
      target.innerHTML = `<div class="card"><p>${escapeHtml(item.notes || 'No notes added.')}</p></div>`;
    }
  };
  renderTab('overview');
  body.querySelectorAll('[data-modal-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('[data-modal-tab]').forEach((b) => b.classList.remove('primary'));
      btn.classList.add('primary');
      renderTab(btn.dataset.modalTab);
    });
  });
  modal.showModal();
}

function closeModal() {
  const modal = document.getElementById('item-modal');
  if (modal.open) modal.close();
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) {
    return { status: 'error', message: 'PDF engine unavailable. Refresh and try again.', text: '' };
  }
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n += 1) {
      try {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const txt = content.items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim();
        if (txt) pages.push(`[Page ${n}] ${txt}`);
      } catch (e) {
        console.warn('PDF page parse failed', n, e);
      }
    }
    const joined = pages.join('\n\n').trim();
    if (joined.replace(/\s/g, '').length < 40) {
      return { status: 'likely_scanned', message: 'This PDF appears to be scanned or image-based, so no selectable text was found.', text: '' };
    }
    return { status: 'success', message: 'PDF text extracted successfully.', text: joined };
  } catch (err) {
    console.warn('extractPdfText failed', err);
    return { status: 'error', message: 'Could not extract text from this PDF.', text: '' };
  }
}

function escapeHtml(v = '') {
  return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function escapeHtmlAttr(v = '') { return escapeHtml(v).replaceAll("'", '&#39;'); }

function wireGlobalHandlers() {
  document.getElementById('top-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    switchView(btn.dataset.view);
  });

  document.body.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const itemId = e.target.closest('[data-item]')?.dataset.item;
    if (itemId) { openModal(itemId); return; }

    if (act === 'goto-add') return switchView('add');
    if (act === 'goto-calendar') return switchView('calendar');
    if (act === 'close-modal') return closeModal();
    if (act === 'edit-item') {
      const id = e.target.dataset.id;
      const item = state.items.find((i) => i.id === id);
      switchView('add');
      renderAddForm(item);
      closeModal();
      return;
    }
    if (act === 'delete-item') {
      if (confirm('Delete this item?')) deleteItem(e.target.dataset.id);
      return;
    }
    if (act === 'month-prev') { state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1); renderCalendar(); return; }
    if (act === 'month-next') { state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1); renderCalendar(); return; }

    if (act === 'flip-card') { state.flashcardFlipped = !state.flashcardFlipped; renderStudyTools(); return; }
    if (act === 'card-prev') { state.flashcardIndex = Math.max(0, state.flashcardIndex - 1); state.flashcardFlipped = false; renderStudyTools(); return; }
    if (act === 'card-next') {
      const item = state.items.find((i) => i.id === state.selectedStudyItemId);
      state.flashcardIndex = Math.min((item?.flashcards.length || 1) - 1, state.flashcardIndex + 1);
      state.flashcardFlipped = false;
      renderStudyTools();
      return;
    }
    if (act === 'card-shuffle') {
      const item = state.items.find((i) => i.id === state.selectedStudyItemId);
      if (!item) return;
      item.flashcards.sort(() => Math.random() - 0.5);
      upsertItem(item);
      return;
    }
    if (act === 'mark-know' || act === 'mark-again') {
      const item = state.items.find((i) => i.id === state.selectedStudyItemId);
      if (!item) return;
      if (act === 'mark-know') item.mastery.know += 1;
      else item.mastery.studyAgain += 1;
      upsertItem(item);
      return;
    }
  });

  document.body.addEventListener('change', (e) => {
    if (e.target.id === 'study-item-select') {
      state.selectedStudyItemId = e.target.value;
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

  document.getElementById('item-modal').addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) closeModal();
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
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
}

function init() {
  load();
  initPdfWorker();
  wireGlobalHandlers();
  render();
  switchView('dashboard');
}

window.addEventListener('DOMContentLoaded', init);
