'use strict';
/* ===== Shared utilities for all VaultOne apps ===== */

const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const today = () => new Date().toISOString().slice(0, 10);
const daysUntil = d => {
  if (!d) return null;
  const t = new Date(d + 'T00:00:00');
  if (Number.isNaN(t.getTime())) return null;
  const now = new Date();
  const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t - s) / 86400000);
};
const money = (n, curr) => {
  const c = curr || (typeof state !== 'undefined' && state.settings && state.settings.currency) || 'INR';
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0)); }
  catch { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
};

/* ===== DOM helper ===== */
const $ = id => document.getElementById(id);

/* ===== Form lock helpers (shared across all pages) ===== */
function lockForm(formId, editBtnId) {
  const form = typeof formId === 'string' ? document.getElementById(formId) : formId;
  if (!form) return;
  form.querySelectorAll('input,select,textarea,button[type="submit"]').forEach(el => el.disabled = true);
  form.dataset.locked = '1';
  const btn = document.getElementById(editBtnId);
  if (btn) btn.style.display = 'inline-flex';
}
function unlockForm(formId, editBtnId) {
  const form = typeof formId === 'string' ? document.getElementById(formId) : formId;
  if (!form) return;
  form.querySelectorAll('input,select,textarea,button[type="submit"]').forEach(el => el.disabled = false);
  delete form.dataset.locked;
  const btn = document.getElementById(editBtnId);
  if (btn) btn.style.display = 'none';
}

/* ===== Toast ===== */
function toast(msg, err = false) {
  const t = $('toast');
  t.textContent = msg;
  t.style.borderColor = err ? '#7d2738' : '#334966';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

/* ===== Modal ===== */
function openModal(title, html, onSubmit) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = html;
  $('modal').classList.add('open');
  const f = $('modalBody').querySelector('form');
  if (f && onSubmit) f.onsubmit = e => { e.preventDefault(); onSubmit(new FormData(f)); };
  // auto-focus first interactive field
  setTimeout(() => {
    const first = $('modalBody').querySelector('input:not([type=hidden]),select,textarea');
    first?.focus();
  }, 60);
}
function closeModal() {
  $('modal').classList.remove('open');
  $('modalBody').innerHTML = '';
}
const _mc = $('modalClose');
if (_mc) _mc.onclick = closeModal;
$('modal')?.addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

/* ===== IndexedDB helpers ===== */
let db;
function txStore(store, mode = 'readonly') { return db.transaction(store, mode).objectStore(store); }
function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function getAll(store) { return req(txStore(store).getAll()); }
async function getOne(store, id) { return req(txStore(store).get(id)); }
async function putOne(store, obj) { return req(txStore(store, 'readwrite').put(obj)); }
async function delOne(store, id) { return req(txStore(store, 'readwrite').delete(id)); }
async function clearStore(store) { return req(txStore(store, 'readwrite').clear()); }

async function openDB(dbName, version, stores) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(dbName, version);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      stores.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
    };
    r.onsuccess = () => {
      db = r.result;
      db.onversionchange = () => db.close();
      resolve();
    };
    r.onerror = () => reject(r.error);
  });
}

/* ===== Activity log ===== */
async function logActivity(type, text) {
  await putOne('activity', { id: uid(), type, text, createdAt: new Date().toISOString() });
}

/* ===== Pagination ===== */
const _pageState = {};
function getPage(key) { return _pageState[key] || (_pageState[key] = { page: 1, pageSize: '10' }); }
function paginate(key, rows) {
  const st = getPage(key);
  const size = st.pageSize;
  const total = rows.length;
  const totalPages = size === 'all' ? 1 : Math.max(1, Math.ceil(total / Number(size)));
  st.page = Math.min(Math.max(1, st.page), totalPages);
  const pageRows = size === 'all' ? rows : rows.slice((st.page - 1) * Number(size), st.page * Number(size));
  return { pageRows, totalPages, page: st.page, total };
}
function paginationHtml(key, page, totalPages, total, pageSize) {
  return `<div class="pagination" data-pg="${key}">
    <div class="pagination-info">
      <label style="display:inline-flex;align-items:center;gap:8px;margin:0">
        <span class="pagination-size-text">Rows per page</span>
        <select class="pg-size" data-key="${key}">
          <option value="5" ${pageSize === '5' ? 'selected' : ''}>5</option>
          <option value="10" ${pageSize === '10' ? 'selected' : ''}>10</option>
          <option value="25" ${pageSize === '25' ? 'selected' : ''}>25</option>
        </select>
      </label>
      <span class="muted pagination-summary">${total ? `Page ${page} of ${totalPages} · ${total} total` : ''}</span>
      <span class="muted pagination-summary-compact">${total ? `${page}/${totalPages}` : ''}</span>
    </div>
    <div class="pagination-nav">
      <button type="button" class="btn pg-prev" data-key="${key}" ${page <= 1 ? 'disabled' : ''}>←<span class="pagination-nav-text"> Prev</span></button>
      <button type="button" class="btn pg-next" data-key="${key}" ${page >= totalPages ? 'disabled' : ''}>→<span class="pagination-nav-text"> Next</span></button>
    </div>
  </div>`;
}
const _pgRender = {};
document.addEventListener('click', e => {
  const prev = e.target.closest('.pg-prev');
  if (prev) { const st = getPage(prev.dataset.key); if (st.page > 1) { st.page--; _pgRender[prev.dataset.key]?.(); } return; }
  const next = e.target.closest('.pg-next');
  if (next) { const st = getPage(next.dataset.key); st.page++; _pgRender[next.dataset.key]?.(); return; }
});
document.addEventListener('change', e => {
  const sel = e.target.closest('.pg-size');
  if (sel) { const st = getPage(sel.dataset.key); st.pageSize = sel.value; st.page = 1; _pgRender[sel.dataset.key]?.(); }
});

/* ===== Reminders ===== */
function priorityIcon(p) {
  if (p === 'High') return '❗';
  if (p === 'Medium') return '🟠';
  return '🟢';
}
function formatReminderDT(dateStr, timeStr) {
  try {
    const d = new Date(`${dateStr}T${timeStr || '09:00'}`);
    if (Number.isNaN(d.getTime())) return `${dateStr || ''} ${timeStr || ''}`.trim();
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return `${dateStr || ''} ${timeStr || ''}`.trim(); }
}

function updateBellBadge(rows) {
  const badge = $('bellReminderBadge');
  if (!badge) return;
  const n = (rows || []).filter(r => !r.completed).length;
  if (n > 0) { badge.textContent = n > 99 ? '99+' : String(n); badge.style.display = 'inline-block'; }
  else badge.style.display = 'none';
}

function renderBellReminders() {
  getAll('reminders').then(rows => {
    updateBellBadge(rows);
    const listEl = $('bellRemList');
    if (!listEl) return;
    if (!rows.length) { listEl.innerHTML = '<div class="empty">No reminders yet.</div>'; return; }
    const pending = rows.filter(r => !r.completed).sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
    const done = rows.filter(r => r.completed).sort((a, b) => ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')));
    const sorted = [...pending, ...done];
    _pgRender['bellRem'] = renderBellReminders;
    const { pageRows, totalPages, page, total } = paginate('bellRem', sorted);
    const st = getPage('bellRem');
    const html = pageRows.map(r => {
      const overdue = !r.completed && daysUntil(r.date) < 0;
      const cls = r.completed ? 'is-read' : overdue ? 'is-overdue' : 'is-unread';
      const actions = !r.completed
        ? `<button class="btn-icon" type="button" data-rdone="${r.id}" title="Complete">✅</button>
           <button class="btn-icon" type="button" data-rsnooze="${r.id}" title="Snooze">😴</button>`
        : '';
      return `<div class="reminder-row ${cls}">
        <div class="reminder-row-top">
          <span class="reminder-datetime" data-ropen="${r.id}">${esc(formatReminderDT(r.date, r.time))}</span>
          <div class="reminder-actions">${actions}</div>
        </div>
        <div class="reminder-title-line" data-ropen="${r.id}">
          <span class="reminder-priority-icon">${priorityIcon(r.priority)}</span>
          <span>${esc(r.title)}</span>
        </div>
      </div>`;
    }).join('');
    listEl.innerHTML = html + paginationHtml('bellRem', page, totalPages, total, st.pageSize);
    listEl.querySelectorAll('[data-rdone]').forEach(b => b.onclick = async () => {
      const r = await getOne('reminders', b.dataset.rdone);
      if (!r) return;
      r.completed = true;
      await putOne('reminders', r);
      swCancelReminder(r);
      await logActivity('Reminder', 'Reminder completed');
      renderBellReminders();
      if (typeof renderHome === 'function') renderHome();
    });
    listEl.querySelectorAll('[data-rsnooze]').forEach(b => b.onclick = async () => {
      const r = await getOne('reminders', b.dataset.rsnooze);
      if (r) openSnoozeOptions(r);
    });
    listEl.querySelectorAll('[data-ropen]').forEach(el => el.onclick = async () => {
      const r = await getOne('reminders', el.dataset.ropen);
      if (r) reminderModal(r);
    });
  });
}

function reminderModal(existing = null) {
  const isEdit = !!existing;
  const p = existing?.priority || 'Normal';
  openModal(isEdit ? 'Edit Reminder' : 'Add Reminder', `<form class="grid">
    <label>Title <span class="req-star">*</span><input name="title" required value="${esc(existing?.title || '')}"></label>
    <label>Date <span class="req-star">*</span><input name="date" type="date" required value="${esc(existing?.date || today())}"></label>
    <label>Time<input name="time" type="time" value="${esc(existing?.time || '09:00')}"></label>
    <label>Priority<select name="priority">
      <option ${p === 'Normal' ? 'selected' : ''}>Normal</option>
      <option ${p === 'Medium' ? 'selected' : ''}>Medium</option>
      <option ${p === 'High' ? 'selected' : ''}>High</option>
    </select></label>
    <label style="grid-column:1/-1">Description<textarea name="description">${esc(existing?.description || '')}</textarea></label>
    <div class="actions" style="grid-column:1/-1">
      <button class="btn primary">Save Reminder</button>
      ${isEdit ? '<button type="button" class="btn danger" id="remDelBtn">Delete</button>' : ''}
    </div>
  </form>`, async fd => {
    const _rem = {
      id: existing?.id || uid(),
      title: fd.get('title'), date: fd.get('date'), time: fd.get('time'),
      priority: fd.get('priority'), description: fd.get('description'),
      completed: existing?.completed || false,
      createdAt: existing?.createdAt || new Date().toISOString()
    };
    await putOne('reminders', _rem);
    swScheduleReminder(_rem);
    await logActivity('Reminder', isEdit ? 'Reminder updated' : 'Reminder added');
    closeModal(); toast('Reminder saved');
    renderBellReminders();
    if (typeof renderHome === 'function') renderHome();
  });
  if (isEdit) {
    setTimeout(() => {
      $('remDelBtn')?.addEventListener('click', async () => {
        if (!confirm('Delete this reminder?')) return;
        await delOne('reminders', existing.id);
        await logActivity('Reminder', 'Reminder deleted');
        closeModal(); toast('Reminder deleted');
        renderBellReminders();
        if (typeof renderHome === 'function') renderHome();
      });
    }, 0);
  }
}

function openSnoozeOptions(reminder) {
  openModal('Snooze Reminder', `<div class="card"><p class="muted">Snooze "${esc(reminder.title)}" for:</p>
    <div class="actions">
      <button class="btn primary" type="button" data-sm="10">⏱️ 10 Minutes</button>
      <button class="btn primary" type="button" data-sm="60">⏱️ 1 Hour</button>
      <button class="btn primary" type="button" data-stom="1">📅 Tomorrow</button>
    </div></div>`);
  $('modalBody').querySelectorAll('[data-sm]').forEach(b => b.onclick = () => snoozeReminder(reminder, { minutes: Number(b.dataset.sm) }));
  $('modalBody').querySelector('[data-stom]')?.addEventListener('click', () => snoozeReminder(reminder, { tomorrow: true }));
}

async function snoozeReminder(reminder, opts) {
  let target;
  if (opts.tomorrow) {
    target = new Date(); target.setDate(target.getDate() + 1);
    const [hh, mm] = String(reminder.time || '09:00').split(':').map(Number);
    target.setHours(Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0, 0, 0);
  } else {
    target = new Date(Date.now() + (opts.minutes || 10) * 60000);
  }
  const pad = n => String(n).padStart(2, '0');
  reminder.date = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
  reminder.time = `${pad(target.getHours())}:${pad(target.getMinutes())}`;
  reminder.completed = false;
  await putOne('reminders', reminder);
  swScheduleReminder(reminder);
  await logActivity('Reminder', 'Reminder snoozed');
  closeModal(); toast('Reminder snoozed');
  renderBellReminders();
}

/* Bell panel wiring */
(function () {
  const bellBtn = $('bellReminderBtn'), panel = $('reminderFloatingPanel');
  const closeBtn = $('reminderFloatingClose');
  const addBtn = $('floatingAddReminderBtn'), form = $('bellReminderForm'), cancelBtn = $('bellReminderCancel');
  const setFormVisible = v => {
    form.style.display = v ? 'grid' : 'none';
    addBtn.style.display = v ? 'none' : 'inline-flex';
    if (v) { form.reset(); const di = form.querySelector('input[name="date"]'); if (di) di.value = today(); form.querySelector('input[name="title"]')?.focus(); }
  };
  const openPanel = () => {
    panel.classList.add('open'); setFormVisible(false); renderBellReminders();
    document.getElementById('settingsPanel')?.classList.remove('open');
    // refresh notif status text inside panel
    const st = panel.querySelector('#bellNotifStatus');
    if (st) {
      if (window.VaultOneAndroid) {
        try { st.textContent = window.VaultOneAndroid.hasNotificationPermission() ? 'Notifications: enabled' : 'Notifications: not enabled'; } catch { st.textContent = ''; }
      } else if ('Notification' in window) {
        st.textContent = 'Notifications: ' + Notification.permission;
      }
    }
  };
  const closePanel = () => { panel.classList.remove('open'); setFormVisible(false); };
  bellBtn?.addEventListener('click', () => panel.classList.contains('open') ? closePanel() : openPanel());
  closeBtn?.addEventListener('click', closePanel);
  addBtn?.addEventListener('click', () => setFormVisible(true));
  cancelBtn?.addEventListener('click', () => setFormVisible(false));
  // Inject Notifications row into panel once
  if (panel && !panel.querySelector('#bellNotifRow')) {
    const row = document.createElement('div');
    row.id = 'bellNotifRow';
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0 10px;border-bottom:1px solid #ffffff10;margin-bottom:8px';
    row.innerHTML = '<span class="muted" id="bellNotifStatus" style="font-size:12px"></span><button class="btn" id="bellNotifBtn" style="padding:6px 12px;font-size:12px;white-space:nowrap">📳 Notifications</button>';
    panel.insertBefore(row, panel.querySelector('.actions'));
    document.getElementById('bellNotifBtn')?.addEventListener('click', async () => {
      if (window.VaultOneAndroid) {
        try { window.VaultOneAndroid.requestNotificationPermission?.(); setTimeout(() => openPanel(), 900); toast('Allow VaultOne to send notifications if prompted.'); } catch(e) { toast('Permission request failed: '+e.message, true); }
        return;
      }
      if (!('Notification' in window)) { toast('Notifications not supported in this browser.', true); return; }
      const p = await Notification.requestPermission();
      const st = document.getElementById('bellNotifStatus');
      if (st) st.textContent = 'Notifications: ' + p;
      toast(p === 'granted' ? 'Notifications enabled' : 'Permission not granted', p !== 'granted');
      if (p === 'granted') setTimeout(() => window._checkReminders?.(), 500);
    });
  }
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const date = String(fd.get('date') || '').trim();
    if (!title) { toast('Enter a reminder title', true); return; }
    if (!date) { toast('Select a date', true); return; }
    const _qrem = {
      id: uid(), title, date,
      time: String(fd.get('time') || '09:00'),
      priority: String(fd.get('priority') || 'Normal'),
      description: String(fd.get('description') || ''),
      completed: false, createdAt: new Date().toISOString()
    };
    await putOne('reminders', _qrem);
    swScheduleReminder(_qrem);
    await logActivity('Reminder', 'Reminder added');
    toast('Reminder saved'); setFormVisible(false);
    renderBellReminders();
    if (typeof renderHome === 'function') renderHome();
  });
  document.addEventListener('click', e => {
    if (!panel || !panel.classList.contains('open')) return;
    if (panel.contains(e.target) || bellBtn?.contains(e.target)) return;
    closePanel();
  });
})();

/* ===== Notes ===== */
(function () {
  const fab = $('notesFab'), panel = $('notesPanel'), closeBtn = $('notesPanelClose');
  const addBtn = $('notesAddBtn'), cancelBtn = $('notesCancelBtn');
  const listEl = $('notesList');
  if (!fab) return;

  const openPanel = () => { panel.classList.add('open'); renderNotesList(); };
  const closePanel = () => panel.classList.remove('open');
  fab.onclick = () => panel.classList.contains('open') ? closePanel() : openPanel();
  closeBtn.onclick = closePanel;
  document.addEventListener('click', e => {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(e.target) || fab.contains(e.target)) return;
    closePanel();
  });

  function renderNoteForm(note = null) {
    const fmt = note?.format || 'text';
    const bodyVal = note?.body || '';
    $('notesFormArea').innerHTML = `
      <input type="hidden" name="id" value="${esc(note?.id || '')}">
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <label style="display:inline-flex;align-items:center;gap:5px;font-weight:600;font-size:13px;color:#94a3b8">
          Format:
          <select name="format" id="noteFmtSel" style="width:auto;margin-top:0;padding:6px 10px;font-size:13px">
            <option value="text" ${fmt==='text'?'selected':''}>📝 Text</option>
            <option value="checklist" ${fmt==='checklist'?'selected':''}>✅ Checklist</option>
            <option value="table" ${fmt==='table'?'selected':''}>📊 Table</option>
          </select>
        </label>
      </div>
      <label style="display:block;margin-bottom:8px">Title<input name="title" placeholder="Note title" value="${esc(note?.title || '')}" style="margin-top:4px;width:100%"></label>
      <div id="noteFmtHelp" class="muted" style="font-size:11px;margin-bottom:6px"></div>
      <label style="display:block">Content <span class="req-star">*</span>
        <textarea name="body" required id="noteBodyInput" style="margin-top:4px;min-height:100px;width:100%;font-family:ui-monospace,monospace;font-size:13px">${esc(bodyVal)}</textarea>
      </label>
      <div class="actions" style="margin-top:10px">
        <button type="submit" class="btn primary">Save</button>
        <button type="button" class="btn ghost" id="notesCancelBtn2">Cancel</button>
      </div>`;
    updateFmtHelp(fmt);
    document.getElementById('noteFmtSel').onchange = e => updateFmtHelp(e.target.value);
    document.getElementById('notesCancelBtn2').onclick = hideForm;
    setTimeout(() => $('notesFormArea').querySelector('[name=title]')?.focus(), 60);
  }

  function updateFmtHelp(fmt) {
    const el = document.getElementById('noteFmtHelp');
    if (!el) return;
    if (fmt === 'checklist') el.textContent = 'One item per line. Start with [ ] for unchecked, [x] for checked.';
    else if (fmt === 'table') el.textContent = 'Use | col1 | col2 | format. First row = header.';
    else el.textContent = '';
  }

  const showForm = (note = null) => {
    $('notesFormWrap').style.display = 'block'; addBtn.style.display = 'none';
    renderNoteForm(note);
  };
  const hideForm = () => { $('notesFormWrap').style.display = 'none'; addBtn.style.display = 'inline-flex'; };
  addBtn.onclick = () => showForm();
  cancelBtn?.addEventListener('click', hideForm);

  $('notesForm').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const id = String(fd.get('id') || '').trim() || uid();
    const body = String(fd.get('body') || '').trim();
    if (!body) { toast('Note content is required', true); return; }
    const existing = await getOne('notes', id).catch(() => null);
    await putOne('notes', {
      id, title: String(fd.get('title') || '').trim(), body,
      format: String(fd.get('format') || 'text'),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    hideForm(); renderNotesList(); toast('Saved');
  };

  function renderNoteBody(n) {
    const fmt = n.format || 'text';
    const body = n.body || '';
    if (fmt === 'checklist') {
      const items = body.split('\n').map((line, idx) => {
        const checked = /^\[x\]/i.test(line.trim());
        const text = line.replace(/^\[.\]\s*/i, '').trim();
        return `<div style="display:flex;align-items:flex-start;gap:7px;padding:3px 0;cursor:pointer" data-clitem="${idx}" data-noteid="${n.id}">
          <span style="font-size:16px;line-height:1.3;flex:0 0 auto;pointer-events:none">${checked ? '✅' : '⬜'}</span>
          <span style="pointer-events:none;${checked ? 'text-decoration:line-through;color:#94a3b8' : ''}">${esc(text)}</span>
        </div>`;
      }).join('');
      return `<div style="font-size:13px" data-checklist="${n.id}">${items}</div>`;
    }
    if (fmt === 'table') {
      const lines = body.split('\n').filter(l => l.trim());
      if (!lines.length) return '';
      const parseRow = l => l.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1 || (a[0] !== '' || a[a.length-1] !== ''));
      const cleanRow = l => { const parts = l.split('|'); return parts.slice(parts[0].trim()===''?1:0, parts[parts.length-1].trim()===''?parts.length-1:parts.length).map(c=>c.trim()); };
      const rows = lines.filter(l => !/^[\s|:-]+$/.test(l)).map(cleanRow);
      if (!rows.length) return esc(body);
      const [head, ...body2] = rows;
      return `<div class="table-wrap"><table class="data-table" style="min-width:0">
        <thead><tr>${head.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${body2.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    }
    return `<div style="white-space:pre-wrap;word-break:break-word;font-size:13px;color:#b7c2d4">${esc(body)}</div>`;
  }

  async function renderNotesList() {
    const rows = (await getAll('notes')).sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
    if (!rows.length) { listEl.innerHTML = '<div class="empty">No notes yet.</div>'; return; }
    const fmtIcon = f => f === 'checklist' ? '✅' : f === 'table' ? '📊' : '📝';
    listEl.innerHTML = rows.map(n => `<div class="note-card">
      <div class="note-card-title">${fmtIcon(n.format)} ${esc(n.title || 'Note')}</div>
      <div class="note-card-body">${renderNoteBody(n)}</div>
      <div class="note-card-meta">${new Date(n.updatedAt || n.createdAt).toLocaleString()}</div>
      <div class="note-card-actions">
        <button class="btn btn-icon" type="button" data-nedit="${n.id}">✏️</button>
        <button class="btn btn-icon danger" type="button" data-ndel="${n.id}">🗑️</button>
      </div></div>`).join('');
    listEl.querySelectorAll('[data-nedit]').forEach(b => b.onclick = async () => { const n = await getOne('notes', b.dataset.nedit); if (n) showForm(n); });
    listEl.querySelectorAll('[data-ndel]').forEach(b => b.onclick = async () => { if (!confirm('Delete note?')) return; await delOne('notes', b.dataset.ndel); renderNotesList(); toast('Deleted'); });
    // Checklist item toggle
    listEl.querySelectorAll('[data-clitem]').forEach(el => el.onclick = async () => {
      const noteId = el.dataset.noteid;
      const idx = Number(el.dataset.clitem);
      const note = await getOne('notes', noteId);
      if (!note) return;
      const lines = note.body.split('\n');
      const line = lines[idx] || '';
      const checked = /^\[x\]/i.test(line.trim());
      lines[idx] = checked ? '[ ] ' + line.replace(/^\[.\]\s*/i, '') : '[x] ' + line.replace(/^\[.\]\s*/i, '');
      note.body = lines.join('\n');
      note.updatedAt = new Date().toISOString();
      await putOne('notes', note);
      renderNotesList();
    });
  }
  window.renderNotesList = renderNotesList;
})();

/* ===== Settings panel ===== */
(function () {
  const SETTINGS_KEY = 'vaultone_settings';
  function loadGlobalSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; } }
  function saveGlobalSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

  function buildSettingsPanel() {
    const s = loadGlobalSettings();
    const panel = document.createElement('div');
    panel.id = 'settingsPanel';
    panel.className = 'settings-panel';
    panel.innerHTML = `
      <div class="settings-panel-head"><h3>⚙️ Settings</h3><button class="iconbtn" id="settingsPanelClose">✕</button></div>
      <div class="grid" style="grid-template-columns:1fr">
        <label>Display Name<input id="spName" placeholder="Your name" value="${esc(s.name || '')}"></label>
        <label>Currency
          <select id="spCurrency">
            <option ${(s.currency||'INR')==='INR'?'selected':''}>INR</option>
            <option ${s.currency==='USD'?'selected':''}>USD</option>
            <option ${s.currency==='EUR'?'selected':''}>EUR</option>
            <option ${s.currency==='GBP'?'selected':''}>GBP</option>
          </select>
        </label>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn primary" id="spSave">Save Settings</button>
        ${'noActLog' in document.body.dataset ? '' : '<button class="btn" id="spActLogBtn">📜 Activity Log</button>'}
      </div>
      <div id="spModuleExtra"></div>`;
    document.body.appendChild(panel);
    document.getElementById('settingsPanelClose').onclick = closeSettingsPanel;
    document.getElementById('spSave').onclick = () => {
      const s = { name: document.getElementById('spName').value.trim(), currency: document.getElementById('spCurrency').value };
      saveGlobalSettings(s);
      if (typeof state !== 'undefined' && state.settings) {
        state.settings.name = s.name;
        state.settings.currency = s.currency;
        if (typeof applySettings === 'function') applySettings();
        if (typeof putOne === 'function') putOne('meta', state.settings).catch(() => {});
      }
      toast('Settings saved');
      closeSettingsPanel();
    };
    document.getElementById('spActLogBtn')?.addEventListener('click', () => {
      if (!db) return;
      closeSettingsPanel();
      openModal('\ud83d\udcdc Activity Log', '<div id="spActLogContainer"></div>');
      setTimeout(() => renderActivityLog('spActLogContainer'), 0);
    });
    document.addEventListener('click', e => {
      if (!panel.classList.contains('open')) return;
      const btn = document.getElementById('settingsBtn');
      if (!panel.contains(e.target) && !btn?.contains(e.target)) closeSettingsPanel();
    });
  }

  function openSettingsPanel() {
    // refresh values each open
    const s = loadGlobalSettings();
    const nameEl = document.getElementById('spName');
    const currEl = document.getElementById('spCurrency');
    if (nameEl) nameEl.value = s.name || '';
    if (currEl) currEl.value = s.currency || 'INR';
    document.getElementById('settingsPanel')?.classList.add('open');
    document.getElementById('reminderFloatingPanel')?.classList.remove('open');
  }
  function closeSettingsPanel() { document.getElementById('settingsPanel')?.classList.remove('open'); }

  // Wire buttons after DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    buildSettingsPanel();
    document.getElementById('settingsBtn')?.addEventListener('click', () =>
      document.getElementById('settingsPanel')?.classList.contains('open') ? closeSettingsPanel() : openSettingsPanel());
  });

  window.openSettingsPanel = openSettingsPanel;
  window.appendSettingsPanelSection = (html) => {
    const el = document.getElementById('spModuleExtra');
    if (el) el.innerHTML = html;
  };
})();

/* ===== Backup / Restore helpers ===== */
function bufToB64(buf) { let bin = ''; const bytes = new Uint8Array(buf); const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk)); return btoa(bin); }
function b64ToBuf(s) { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a.buffer; }
function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

async function exportJSON(appName, stores) {
  const out = { app: appName, exportedAt: new Date().toISOString() };
  for (const s of stores) {
    const rows = await getAll(s);
    if (s === 'documents') {
      out[s] = [];
      for (const r of rows) {
        const x = { ...r };
        if (x.fileBlob instanceof Blob) { x.fileBytes = bufToB64(await x.fileBlob.arrayBuffer()); delete x.fileBlob; }
        out[s].push(x);
      }
    } else { out[s] = rows; }
  }
  return out;
}

async function importJSON(data, appName, stores) {
  if (!data || data.app !== appName) throw new Error('Invalid backup file for ' + appName);
  if (!confirm('Restore this backup? Existing data will be replaced.')) return false;
  for (const s of stores) await clearStore(s);
  for (const s of stores) {
    for (const row of (data[s] || [])) {
      const r = { ...row };
      if (s === 'documents' && r.fileBytes) { r.fileBlob = new Blob([b64ToBuf(r.fileBytes)], { type: r.mimeType || 'application/octet-stream' }); delete r.fileBytes; }
      await putOne(s, r);
    }
  }
  return true;
}

/* ===== Activity log renderer ===== */
function renderActivityLog(containerId) {
  getAll('activity').then(rows => {
    const el = $(containerId);
    if (!el) return;
    _pgRender['actLog'] = () => renderActivityLog(containerId);
    const sorted = rows.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (!sorted.length) { el.innerHTML = '<div class="empty">No activity recorded yet.</div>'; return; }
    const { pageRows, totalPages, page, total } = paginate('actLog', sorted);
    const st = getPage('actLog');
    const body = pageRows.map(a => `<tr><td>${esc(new Date(a.createdAt).toLocaleString())}</td><td><span class="pill">${esc(a.type)}</span></td><td>${esc(a.text || '')}</td></tr>`).join('');
    el.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Date & Time</th><th>Type</th><th>Details</th></tr></thead><tbody>${body}</tbody></table></div>` + paginationHtml('actLog', page, totalPages, total, st.pageSize);
  });
}

/* ===== Notification helpers ===== */
function hasNativeBridge() { return Boolean(window.VaultOneAndroid && typeof window.VaultOneAndroid.scheduleReminderNotification === 'function'); }
function updateNotificationStatus() {
  const el = $('notificationStatus'); if (!el) return;
  if (hasNativeBridge()) { try { el.textContent = 'Notifications: ' + (window.VaultOneAndroid.hasNotificationPermission() ? 'enabled (Android)' : 'not enabled'); } catch { el.textContent = 'Notifications: unknown'; } return; }
  if (!('Notification' in window)) { el.textContent = 'Browser notifications unavailable'; return; }
  el.textContent = 'Notifications: ' + Notification.permission;
}
async function enableNotifications() {
  if (hasNativeBridge()) { try { window.VaultOneAndroid.requestNotificationPermission?.(); setTimeout(updateNotificationStatus, 900); toast('Allow VaultOne to send notifications if prompted.'); } catch (e) { toast('Permission request failed: ' + e.message, true); } return; }
  if (!('Notification' in window)) { toast('Notifications not supported in this browser.', true); return; }
  const p = await Notification.requestPermission();
  updateNotificationStatus();
  toast(p === 'granted' ? 'Notifications enabled' : 'Permission not granted', p !== 'granted');
}

/* ===== Service Worker registration & messaging ===== */
let _swReg = null;

async function _registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    _swReg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
  } catch { _swReg = null; }
}

function _swPost(msg) {
  if (!_swReg) return;
  const sw = _swReg.active || _swReg.installing || _swReg.waiting;
  sw?.postMessage(msg);
}

// Call after any reminder save/update to push it to the SW
function swScheduleReminder(r) { _swPost({ type: 'SCHEDULE', reminder: r }); }
function swCancelReminder(r)   { _swPost({ type: 'CANCEL',   reminder: r }); }

async function swScheduleAll() {
  if (!db) return;
  try {
    const all = await getAll('reminders');
    const pending = all.filter(r => !r.completed);
    _swPost({ type: 'SCHEDULE_ALL', reminders: pending });
  } catch {}
}

// Register SW and schedule all pending reminders on page load
_registerSW().then(() => setTimeout(swScheduleAll, 1500));

/* ===== Browser notification scheduler (tab-open fallback) ===== */
(function () {
  const FIRED_KEY = 'vaultone_notif_fired';
  function getFired() { try { return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}'); } catch { return {}; } }
  function fireKey(r) { return r.id + '|' + r.date + 'T' + (r.time || '09:00'); }
  function markFired(r) { const f = getFired(); f[fireKey(r)] = Date.now(); localStorage.setItem(FIRED_KEY, JSON.stringify(f)); }
  function wasFired(r) { return !!getFired()[fireKey(r)]; }

  async function checkReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!db) return;
    let rows;
    try { rows = await getAll('reminders'); } catch { return; }
    const now = new Date();
    for (const r of rows) {
      if (r.completed) continue;
      const due = new Date(`${r.date}T${r.time || '09:00'}`);
      if (isNaN(due.getTime())) continue;
      if (now >= due && !wasFired(r)) {
        markFired(r);
        try {
          new Notification(r.title || 'Reminder', {
            body: r.description || formatReminderDT(r.date, r.time),
            icon: 'VaultOne.png',
            tag: fireKey(r)
          });
        } catch {}
      }
    }
    // Purge fired log entries older than 7 days
    const cutoff = Date.now() - 7 * 86400000;
    const f = getFired();
    let changed = false;
    for (const k of Object.keys(f)) { if (f[k] < cutoff) { delete f[k]; changed = true; } }
    if (changed) localStorage.setItem(FIRED_KEY, JSON.stringify(f));
  }

  setInterval(checkReminders, 60000);
  setTimeout(checkReminders, 2000);
  window._checkReminders = checkReminders;
})();
