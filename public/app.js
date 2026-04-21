// ── State ──────────────────────────────────────────────────────────────────────
const state = {
  tasks: [],
  currentCategory: 'all',
  currentFilter: 'all',
  searchQuery: '',
  authStatus: { authenticated: false, configured: false },
  reminderTaskId: null   // null = standalone reminder, id = task reminder
};

// ── API ────────────────────────────────────────────────────────────────────────
const api = {
  async getTasks() {
    const r = await fetch('/api/tasks');
    return r.json();
  },
  async createTask(text, category) {
    const r = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, category })
    });
    return r.json();
  },
  async updateTask(id, data) {
    const r = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async deleteTask(id) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  },
  async getAuthStatus() {
    const r = await fetch('/auth/status');
    return r.json();
  },
  async logout() {
    await fetch('/auth/logout', { method: 'POST' });
  },
  async createCalendarEvent(data) {
    const r = await fetch('/api/calendar/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return r.json();
  }
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const dom = {
  taskList:       $('taskList'),
  emptyState:     $('emptyState'),
  headerTitle:    $('headerTitle'),
  headerBadge:    $('headerBadge'),
  newTaskInput:   $('newTaskInput'),
  newTaskCat:     $('newTaskCategory'),
  addPlusBtn:     $('addPlusBtn'),
  searchInput:    $('searchInput'),
  filterTabs:     $('filterTabs'),
  gcalDot:        $('gcalDot'),
  gcalLabel:      $('gcalLabel'),
  gcalBtn:        $('gcalBtn'),
  sidebarReminderBtn: $('sidebarReminderBtn'),
  // Modal
  modalOverlay:   $('modalOverlay'),
  modalTitle:     $('modalTitle'),
  modalDesc:      $('modalDesc'),
  modalDatetime:  $('modalDatetime'),
  modalDuration:  $('modalDuration'),
  modalRemindMins:$('modalRemindMins'),
  modalCloseBtn:  $('modalCloseBtn'),
  modalCancelBtn: $('modalCancelBtn'),
  modalSubmitBtn: $('modalSubmitBtn'),
  modalAuthWall:  $('modalAuthWall'),
  authWallMessage:$('authWallMessage'),
  authWallCancel: $('authWallCancel'),
  toast:          $('toast')
};

// ── Toast ──────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  dom.toast.textContent = msg;
  dom.toast.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 3000);
}

// ── Auth UI ────────────────────────────────────────────────────────────────────
async function refreshAuth() {
  state.authStatus = await api.getAuthStatus();
  renderAuthUI();
}

function renderAuthUI() {
  const { authenticated, configured } = state.authStatus;
  const dot = dom.gcalDot;
  const lbl = dom.gcalLabel;
  const btn = dom.gcalBtn;

  if (!configured) {
    dot.className = 'status-dot unconfigured';
    lbl.textContent = 'Not configured';
    btn.textContent = 'Setup guide ↗';
    btn.className = 'gcal-action-btn';
    btn.style.display = '';
    btn.onclick = () => window.open('https://console.cloud.google.com/', '_blank');
  } else if (!authenticated) {
    dot.className = 'status-dot disconnected';
    lbl.textContent = 'Not connected';
    btn.textContent = 'Connect Google Calendar';
    btn.className = 'gcal-action-btn';
    btn.style.display = '';
    btn.onclick = () => { window.location.href = '/auth/google'; };
  } else {
    dot.className = 'status-dot connected';
    lbl.textContent = 'Connected';
    btn.textContent = 'Disconnect';
    btn.className = 'gcal-action-btn disconnect';
    btn.style.display = '';
    btn.onclick = async () => {
      await api.logout();
      await refreshAuth();
      showToast('Disconnected from Google Calendar', 'info');
    };
  }
}

// ── Render tasks ───────────────────────────────────────────────────────────────
function getFilteredTasks() {
  let tasks = state.tasks;
  if (state.currentCategory !== 'all') {
    tasks = tasks.filter(t => t.category === state.currentCategory);
  }
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    tasks = tasks.filter(t => t.text.toLowerCase().includes(q));
  }
  if (state.currentFilter === 'active') {
    tasks = tasks.filter(t => t.status !== 'done');
  } else if (state.currentFilter === 'done') {
    tasks = tasks.filter(t => t.status === 'done');
  }
  return tasks;
}

function renderTasks() {
  const tasks = getFilteredTasks();

  // Update header
  const catLabel = state.currentCategory === 'all' ? 'All Tasks' : state.currentCategory;
  dom.headerTitle.textContent = catLabel;
  dom.headerBadge.textContent = tasks.length;

  // Update sidebar counts
  const categories = ['Calls','Mails','Answers','Articles','Posts','Documents','Projects','Applications','Home Stuff','Todo'];
  const el = id => document.getElementById(id);
  const allEl = el('cnt-all');
  if (allEl) allEl.textContent = state.tasks.length;
  categories.forEach(cat => {
    const e = el(`cnt-${cat}`);
    if (e) e.textContent = state.tasks.filter(t => t.category === cat).length;
  });

  // Render task items
  if (tasks.length === 0) {
    dom.taskList.innerHTML = '';
    dom.emptyState.classList.add('visible');
    return;
  }
  dom.emptyState.classList.remove('visible');

  dom.taskList.innerHTML = tasks.map(task => buildTaskHTML(task)).join('');
  attachTaskEvents();
}

function buildTaskHTML(task) {
  const statuses = [
    { key: 'none',        title: 'No status' },
    { key: 'in-progress', title: 'In Progress' },
    { key: 'urgent',      title: 'Urgent' },
    { key: 'done',        title: 'Done' }
  ];

  const dots = statuses.map(s =>
    `<button class="s-btn${task.status === s.key ? ' active' : ''}"
      data-s="${s.key}" data-id="${task.id}"
      title="${s.title}" aria-label="${s.title}"></button>`
  ).join('');

  const escaped = (task.text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  return `
    <div class="task-item" data-id="${task.id}" data-status="${task.status}">
      <div class="status-selector" title="Set status">${dots}</div>
      <span class="cat-pill">${task.category}</span>
      <div class="task-text-wrap">
        <div class="task-text"
          contenteditable="true"
          data-id="${task.id}"
          spellcheck="false">${escaped}</div>
      </div>
      <div class="task-actions">
        <button class="action-btn reminder-btn" data-id="${task.id}" title="Add to Calendar">🔔</button>
        <button class="action-btn delete-btn" data-id="${task.id}" title="Delete task">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>
    </div>`;
}

function attachTaskEvents() {
  // Status buttons
  dom.taskList.querySelectorAll('.s-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const newStatus = btn.dataset.s;
      const task = state.tasks.find(t => t.id === id);
      if (!task) return;
      // Toggle off if same, else set new
      const status = task.status === newStatus ? 'none' : newStatus;
      task.status = status;
      await api.updateTask(id, { status });
      renderTasks();
    });
  });

  // Inline text editing
  dom.taskList.querySelectorAll('.task-text').forEach(el => {
    let original = el.textContent.trim();
    el.addEventListener('focus', () => { original = el.textContent.trim(); });
    el.addEventListener('blur', async () => {
      const newText = el.textContent.trim();
      if (!newText) { el.textContent = original; return; }
      if (newText === original) return;
      const id = el.dataset.id;
      const task = state.tasks.find(t => t.id === id);
      if (task) task.text = newText;
      await api.updateTask(id, { text: newText });
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.textContent = original; el.blur(); }
    });
  });

  // Reminder buttons
  dom.taskList.querySelectorAll('.reminder-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const task = state.tasks.find(t => t.id === btn.dataset.id);
      openModal(task ? task.text : '', btn.dataset.id);
    });
  });

  // Delete buttons
  dom.taskList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      state.tasks = state.tasks.filter(t => t.id !== id);
      await api.deleteTask(id);
      renderTasks();
      showToast('Task deleted', 'info');
    });
  });
}

// ── Add task ──────────────────────────────────────────────────────────────────
async function addTask() {
  const text = dom.newTaskInput.value.trim();
  if (!text) { dom.newTaskInput.focus(); return; }

  let category = dom.newTaskCat.value;
  // Sync with sidebar selection
  if (state.currentCategory !== 'all') category = state.currentCategory;

  const task = await api.createTask(text, category);
  if (task.id) {
    state.tasks.unshift(task);
    dom.newTaskInput.value = '';
    renderTasks();
  }
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function openModal(prefillTitle = '', taskId = null) {
  state.reminderTaskId = taskId;
  dom.modalTitle.value = prefillTitle;
  dom.modalDesc.value = '';

  // Default datetime: now + 1 hour, rounded to next :00 or :30
  const now = new Date();
  now.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0);
  const pad = n => String(n).padStart(2, '0');
  dom.modalDatetime.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // Auth wall logic
  const { authenticated, configured } = state.authStatus;
  if (!authenticated) {
    dom.modalAuthWall.style.display = 'flex';
    dom.authWallMessage.textContent = configured
      ? 'Sign in to add reminders and events to your Google Calendar.'
      : 'Set up your Google Calendar credentials first. Check the .env file and restart the server.';
    const wallBtn = $('authWallBtn');
    if (!configured) {
      wallBtn.textContent = 'View Setup Guide';
      wallBtn.href = 'https://console.cloud.google.com/';
      wallBtn.target = '_blank';
    } else {
      wallBtn.textContent = 'Connect Google Calendar';
      wallBtn.href = '/auth/google';
      wallBtn.target = '';
    }
  } else {
    dom.modalAuthWall.style.display = 'none';
  }

  dom.modalOverlay.classList.add('open');
  setTimeout(() => dom.modalTitle.focus(), 80);
}

function closeModal() {
  dom.modalOverlay.classList.remove('open');
  state.reminderTaskId = null;
}

async function submitModal() {
  const title = dom.modalTitle.value.trim();
  if (!title) { dom.modalTitle.focus(); showToast('Please enter a title', 'error'); return; }
  if (!dom.modalDatetime.value) { dom.modalDatetime.focus(); showToast('Please select date & time', 'error'); return; }

  const notifType = document.querySelector('input[name="notifType"]:checked').value;

  dom.modalSubmitBtn.disabled = true;
  dom.modalSubmitBtn.textContent = 'Adding…';

  try {
    const result = await api.createCalendarEvent({
      title,
      description: dom.modalDesc.value.trim(),
      datetime: dom.modalDatetime.value,
      duration: dom.modalDuration.value,
      notificationType: notifType,
      reminderMinutes: dom.modalRemindMins.value
    });

    if (result.success) {
      closeModal();
      showToast('Added to Google Calendar!', 'success');
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
    if (e.message && e.message.includes('auth')) await refreshAuth();
  } finally {
    dom.modalSubmitBtn.disabled = false;
    dom.modalSubmitBtn.innerHTML = '<span class="btn-icon">📅</span> Add to Calendar';
  }
}

// ── Event Listeners ────────────────────────────────────────────────────────────
function bindEvents() {
  // Sidebar categories
  document.querySelectorAll('.category-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      state.currentCategory = item.dataset.category;

      // Sync category selector in add bar
      if (state.currentCategory !== 'all') {
        dom.newTaskCat.value = state.currentCategory;
      }
      renderTasks();
    });
  });

  // Add task
  dom.addPlusBtn.addEventListener('click', addTask);
  dom.newTaskInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

  // Search
  dom.searchInput.addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderTasks();
  });

  // Filter tabs
  dom.filterTabs.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      dom.filterTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentFilter = tab.dataset.filter;
      renderTasks();
    });
  });

  // Sidebar reminder button
  dom.sidebarReminderBtn.addEventListener('click', () => openModal());

  // Modal close
  dom.modalCloseBtn.addEventListener('click', closeModal);
  dom.modalCancelBtn.addEventListener('click', closeModal);
  dom.modalOverlay.addEventListener('click', e => { if (e.target === dom.modalOverlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // Auth wall cancel
  dom.authWallCancel.addEventListener('click', closeModal);

  // Modal submit
  dom.modalSubmitBtn.addEventListener('click', submitModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && dom.modalOverlay.classList.contains('open') && e.target !== dom.modalDesc) {
      e.preventDefault();
      submitModal();
    }
  });
}

// ── URL param feedback ─────────────────────────────────────────────────────────
function handleURLParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('auth') === 'success') {
    showToast('Google Calendar connected!', 'success');
  } else if (params.get('error')) {
    const errMap = {
      'no-credentials': 'Google credentials not configured. Check your .env file.',
      'auth-denied': 'Google sign-in was cancelled.',
      'token-failed': 'Failed to get Google tokens. Try again.'
    };
    showToast(errMap[params.get('error')] || 'Google auth error.', 'error');
  }
  if (params.has('auth') || params.has('error')) {
    history.replaceState({}, '', '/');
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  bindEvents();
  handleURLParams();
  [state.tasks, state.authStatus] = await Promise.all([api.getTasks(), api.getAuthStatus()]);
  renderAuthUI();
  renderTasks();
}

init();
