'use strict';
/* ===== PasswordVault — own IndexedDB ===== */
const PV_DB = 'PasswordVaultDB';
const PV_VER = 1;
const PV_STORES = ['meta', 'passwords', 'reminders', 'activity', 'notes'];

let passwordUnlocked = false;
let passwordKey = null;
let autoLockTimer = null;
let state = { settings: { id: 'settings', name: '', currency: 'INR', pinHash: '', autoLock: 0 } };

/* ===== Boot ===== */
(async () => {
  try {
    await openDB(PV_DB, PV_VER, PV_STORES);
    const s = await getOne('meta', 'settings');
    if (s) state.settings = { ...state.settings, ...s };
    applySettings();
    renderPasswordsLocked();
    renderBellReminders();
    updateNotificationStatus();
    // Inject PasswordVault-specific settings section
    appendSettingsPanelSection(`
      <hr style="border-color:#ffffff12;margin:16px 0">
      <h4 style="margin:0 0 12px;font-size:14px;color:#94a3b8">🔒 Vault Security</h4>
      <div class="grid" style="grid-template-columns:1fr">
        <label>Change Vault PIN
          <div class="password-field">
            <input id="spPinInput" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password" placeholder="New 4-12 digit PIN">
            <button type="button" class="password-eye" id="spPinEye">👁️</button>
          </div>
        </label>
        <label>Auto-lock
          <select id="spAutoLock">
            <option value="0" ${(state.settings.autoLock||0)==0?'selected':''}>Off</option>
            <option value="1" ${state.settings.autoLock==1?'selected':''}>1 minute</option>
            <option value="5" ${state.settings.autoLock==5?'selected':''}>5 minutes</option>
            <option value="15" ${state.settings.autoLock==15?'selected':''}>15 minutes</option>
          </select>
        </label>
      </div>
      <div class="actions" style="margin-top:10px">
        <button class="btn primary" id="spSecSave">Save Security Settings</button>
      </div>
      <p class="muted" style="font-size:11px;margin-top:8px">AES-GCM 256-bit · PBKDF2 150k iterations</p>
      <hr style="border-color:#ffffff12;margin:16px 0">
      <h4 style="margin:0 0 12px;font-size:14px;color:#94a3b8">💾 Backup &amp; Restore</h4>
      <div class="actions" style="margin-top:0">
        <button class="btn primary" id="spExportBtn">⬇️ Export JSON</button>
        <button class="btn" id="spImportBtn">⬆️ Import JSON</button>
        <input id="spImportFile" type="file" accept="application/json" hidden>
      </div>
      <hr style="border-color:#ffffff12;margin:16px 0">
      <div class="dangerbox" style="margin-top:0">
        <p class="muted" style="margin:0 0 10px;font-size:13px">Permanently deletes all PasswordVault data on this device.</p>
        <button class="btn danger" id="spPvClearBtn">🗑️ Clear All PasswordVault Data</button>
      </div>`);
    // Wire injected controls
    setTimeout(() => {
      document.getElementById('spPinEye')?.addEventListener('click', () => {
        const x = document.getElementById('spPinInput');
        const b = document.getElementById('spPinEye');
        const v = x.type==='text'; x.type = v?'password':'text'; b.textContent = v?'👁️':'🙈';
      });
      document.getElementById('spSecSave')?.addEventListener('click', async () => {
        const newPin = document.getElementById('spPinInput').value;
        if (newPin) {
          if (!/^\d{4,12}$/.test(newPin)) { toast('PIN must be 4-12 digits', true); return; }
          if (state.settings.pinHash) {
            const old = prompt('Enter your current Vault PIN to change it:');
            if (old === null) return;
            if (await hashPin(old) !== state.settings.pinHash) { toast('Current PIN is incorrect', true); return; }
          }
          state.settings.pinHash = await hashPin(newPin);
        }
        state.settings.autoLock = Number(document.getElementById('spAutoLock').value);
        await putOne('meta', state.settings);
        await logActivity('Settings', 'Security settings saved');
        toast('Security settings saved'); applySettings(); scheduleAutoLock();
      });
      document.getElementById('spExportBtn')?.addEventListener('click', async () => {
        try {
          const data = await exportJSON('PasswordVault', PV_STORES);
          downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}), 'PasswordVault_Backup_'+today()+'.json');
          await logActivity('Backup','JSON backup exported'); toast('Backup exported');
        } catch(e) { toast('Export failed: '+e.message, true); }
      });
      document.getElementById('spImportBtn')?.addEventListener('click', () => {
        document.getElementById('spImportFile').value='';
        document.getElementById('spImportFile').onchange = async () => {
          try {
            const f = document.getElementById('spImportFile').files?.[0]; if(!f) return;
            const data = JSON.parse(await f.text());
            if (await importJSON(data,'PasswordVault',PV_STORES)) {
              const s = await getOne('meta','settings');
              if(s) state.settings={...state.settings,...s};
              applySettings(); renderPasswordsLocked(); renderBellReminders();
              toast('Import completed');
            }
          } catch(e) { toast('Import failed: '+e.message, true); }
        };
        document.getElementById('spImportFile').click();
      });
      document.getElementById('spPvClearBtn')?.addEventListener('click', () => {
        openModal('Clear All PasswordVault Data', `<div class="dangerbox"><p><b>This permanently deletes all PasswordVault data on this device.</b></p></div>
          <form id="pvClearForm"><label>Type DELETE to confirm<input name="confirm" required placeholder="Type DELETE" autocomplete="off"></label>
          <div class="actions"><button class="btn danger">Confirm &amp; Clear</button><button type="button" class="btn" id="pvCancelClear">Cancel</button></div></form>`,
          async fd => {
            if (String(fd.get('confirm')||'').trim().toUpperCase() !== 'DELETE') { toast('Type DELETE exactly', true); return; }
            for (const s of PV_STORES) await clearStore(s);
            state.settings = { id:'settings', name:'', currency:'INR', pinHash:'', autoLock:0 };
            await putOne('meta', state.settings);
            passwordUnlocked = false; passwordKey = null;
            closeModal(); toast('All PasswordVault data cleared');
            applySettings(); renderPasswordsLocked();
          });
        setTimeout(() => { document.getElementById('pvCancelClear')?.addEventListener('click', closeModal); }, 0);
      });
    }, 100);
  } catch (e) {
    document.body.innerHTML = `<div style="padding:30px;color:white"><h2>PasswordVault could not load</h2><p>${esc(e.message)}</p><button onclick="location.reload()">Retry</button></div>`;
  }
})();

function applySettings() {
  const s = state.settings;
  $('profileLine').textContent = s.name ? s.name + ' · Encrypted' : 'Encrypted · Offline-first';
}

/* ===== Crypto ===== */
async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  const h = await crypto.subtle.digest('SHA-256', data);
  return bufToB64(h);
}
async function deriveKey(pin, salt) {
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function encryptEntry(obj, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { salt: bufToB64(salt), iv: bufToB64(iv), cipher: bufToB64(ct) };
}
async function decryptEntry(r, pin) {
  const key = await deriveKey(pin, b64ToBuf(r.salt));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(r.iv) }, key, b64ToBuf(r.cipher));
  return JSON.parse(new TextDecoder().decode(pt));
}

function generatePassword(n = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
  let out = '';
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  for (const x of a) out += chars[x % chars.length];
  return out;
}

async function copyText(text) {
  text = String(text ?? '');
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy'); ta.remove(); if (ok) return true;
  } catch {}
  return false;
}

/* ===== Lock / Unlock ===== */
function lockVault() {
  passwordUnlocked = false; passwordKey = null;
  renderPasswordsLocked(); toast('PasswordVault locked');
}
function scheduleAutoLock() {
  clearTimeout(autoLockTimer);
  const m = Number(state.settings.autoLock || 0);
  if (m > 0) autoLockTimer = setTimeout(lockVault, m * 60000);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && Number(state.settings.autoLock || 0) > 0) scheduleAutoLock();
});
$('lockBtn').onclick = lockVault;

function renderPasswordsLocked() {
  const el = $('passList');
  if (!state.settings.pinHash) {
    el.innerHTML = `<div class="empty">No Vault PIN set yet.
      <div class="actions" style="justify-content:center;margin-top:12px">
        <button class="btn primary" id="setPinBtn">Set PIN</button>
      </div></div>`;
    $('setPinBtn').onclick = setPinAndUnlock;
    return;
  }
  el.innerHTML = `<div class="empty">PasswordVault is locked.
    <div class="actions" style="justify-content:center;margin-top:12px">
      <button class="btn primary" id="unlockBtn">🔓 Unlock</button>
    </div></div>`;
  $('unlockBtn').onclick = unlockPasswords;
}

async function setPinAndUnlock() {
  openModal('Set Vault PIN', `<form class="grid">
    <label>New PIN <span class="req-star">*</span><input name="pin" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password" placeholder="4-12 digits" required></label>
    <label>Confirm PIN <span class="req-star">*</span><input name="pin2" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password" placeholder="Re-enter PIN" required></label>
    <p class="muted" style="grid-column:1/-1;font-size:12px">PIN secures all your password entries. Change it anytime in Settings.</p>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Set PIN &amp; Unlock</button></div>
  </form>`, async fd => {
    const pin = String(fd.get('pin') || ''), pin2 = String(fd.get('pin2') || '');
    if (!/^\d{4,12}$/.test(pin)) { toast('PIN must be 4-12 digits', true); return; }
    if (pin !== pin2) { toast('PINs do not match', true); return; }
    state.settings.pinHash = await hashPin(pin);
    await putOne('meta', state.settings);
    passwordKey = pin; passwordUnlocked = true;
    closeModal(); toast('Vault PIN set');
    await renderPasswords(); scheduleAutoLock();
  });
}

async function unlockPasswords() {
  if (!state.settings.pinHash) { setPinAndUnlock(); return; }
  openModal('Unlock PasswordVault', `<form class="grid">
    <label>Vault PIN<input name="pin" type="password" inputmode="numeric" maxlength="12" autocomplete="current-password" placeholder="Enter PIN" required></label>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">🔓 Unlock</button></div>
  </form>`, async fd => {
    const pin = String(fd.get('pin') || '');
    if (!/^\d{4,12}$/.test(pin)) { toast('PIN must be 4-12 digits', true); return; }
    if (await hashPin(pin) !== state.settings.pinHash) { toast('Invalid PIN', true); return; }
    passwordKey = pin; passwordUnlocked = true;
    closeModal(); await renderPasswords(); scheduleAutoLock();
  });
}

/* ===== Render passwords ===== */
async function renderPasswords() {
  if (!passwordUnlocked) { renderPasswordsLocked(); return; }
  const rows = await getAll('passwords');
  const q = ($('passSearch').value || '').toLowerCase();
  const out = [];
  for (const r of rows) {
    try {
      const p = await decryptEntry(r, passwordKey);
      if (!q || [p.name, p.username, p.url, p.category].some(x => String(x || '').toLowerCase().includes(q))) out.push({ r, p });
    } catch {}
  }
  $('passList').innerHTML = out.length
    ? out.map(({ r, p }) => `<div class="item">
        <div style="min-width:0;flex:1">
          <div class="title">${esc(p.name)} ${p.favorite ? '⭐' : ''}</div>
          <div class="sub">${esc(p.username || '')}${p.url ? ' · ' + esc(p.url) : ''}${p.category ? ' · ' + esc(p.category) : ''}</div>
        </div>
        <div class="actions">
          <button type="button" class="btn-icon" data-pcopy="${r.id}" title="Copy password">📋</button>
          <button type="button" class="btn-icon" data-pedit="${r.id}" title="Edit">✏️</button>
          <button type="button" class="btn-icon danger" data-pdel="${r.id}" title="Delete">🗑️</button>
        </div>
      </div>`).join('')
    : '<div class="empty">No passwords stored.</div>';

  $('passList').querySelectorAll('[data-pcopy]').forEach(b => b.onclick = async () => {
    try {
      const r = await getOne('passwords', b.dataset.pcopy);
      const p = await decryptEntry(r, passwordKey);
      const ok = await copyText(p.password);
      toast(ok ? 'Password copied to clipboard' : 'Copy unavailable on this browser', !ok);
    } catch (e) { toast('Could not copy: ' + e.message, true); }
  });
  $('passList').querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this password?')) return;
    await delOne('passwords', b.dataset.pdel);
    await logActivity('Password', 'Password deleted');
    renderPasswords();
  });
  $('passList').querySelectorAll('[data-pedit]').forEach(b => b.onclick = () => editPassword(b.dataset.pedit));
}

$('passSearch').oninput = () => renderPasswords();

/* ===== Password modal ===== */
function passwordModal(existing = null) {
  openModal(existing ? 'Edit Password' : 'Add Password', `<form class="grid">
    <label>Service <span class="req-star">*</span><input name="name" value="${esc(existing?.name || '')}" required></label>
    <label>Username / Email <span class="req-star">*</span><input name="username" value="${esc(existing?.username || '')}" required></label>
    <label style="grid-column:1/-1">Password <span class="req-star">*</span>
      <div class="password-field">
        <input name="password" type="password" autocomplete="new-password" value="${esc(existing?.password || '')}" required>
        <button type="button" class="password-eye" id="togglePassVis">👁️</button>
      </div>
    </label>
    <label>URL<input name="url" value="${esc(existing?.url || '')}"></label>
    <label>Category<input name="category" value="${esc(existing?.category || '')}" placeholder="Banking, Social..."></label>
    <label>Password Expiry Date<input name="expiryDate" type="date" value="${esc(existing?.expiryDate || '')}"></label>
    <label>Favourite<select name="favorite"><option value="0">No</option><option value="1" ${existing?.favorite ? 'selected' : ''}>Yes</option></select></label>
    <label style="grid-column:1/-1">Notes<textarea name="notes">${esc(existing?.notes || '')}</textarea></label>
    <div class="actions" style="grid-column:1/-1">
      <button class="btn" type="button" id="genInside">🎲 Generate</button>
      <button type="submit" class="btn primary">Save Password</button>
    </div>
  </form>`, async fd => {
    const plain = {
      name: fd.get('name'), username: fd.get('username'), password: fd.get('password'),
      url: fd.get('url'), category: fd.get('category'),
      expiryDate: fd.get('expiryDate') || '',
      favorite: fd.get('favorite') === '1',
      notes: fd.get('notes'), modifiedAt: new Date().toISOString()
    };
    const enc = await encryptEntry(plain, passwordKey);
    const recId = existing?.id || uid();
    await putOne('passwords', { id: recId, ...enc, createdAt: existing?.createdAt || new Date().toISOString() });
    // Auto-create/update expiry reminder
    if (plain.expiryDate) {
      await putOne('reminders', {
        id: 'pwexp-' + recId,
        title: '🔑 Password Expiry: ' + plain.name,
        date: plain.expiryDate, time: '09:00', priority: 'Medium',
        description: 'Username: ' + plain.username,
        completed: false, source: 'password', passwordId: recId,
        createdAt: new Date().toISOString()
      });
    } else {
      await delOne('reminders', 'pwexp-' + recId).catch(() => {});
    }
    await logActivity('Password', existing ? 'Password updated' : 'Password added');
    closeModal(); toast('Password saved'); renderPasswords(); renderBellReminders();
  });
  setTimeout(() => {
    const x = $('modalBody').querySelector('[name=password]');
    const eye = $('togglePassVis');
    if (eye && x) { eye.onclick = () => { const v = x.type === 'text'; x.type = v ? 'password' : 'text'; eye.textContent = v ? '👁️' : '🙈'; }; }
    const gen = $('genInside');
    if (gen) gen.onclick = () => { x.value = generatePassword(22); };
  }, 0);
}

async function editPassword(id) {
  const r = await getOne('passwords', id);
  try { const p = await decryptEntry(r, passwordKey); passwordModal({ ...p, id: r.id, createdAt: r.createdAt }); }
  catch { toast('Could not decrypt record', true); }
}

$('addPassBtn').onclick = () => { if (!passwordUnlocked) { unlockPasswords(); return; } passwordModal(); };
$('genPassBtn').onclick = async () => {
  const p = generatePassword(20);
  const ok = await copyText(p);
  toast(ok ? 'Strong password generated and copied' : 'Generated (copy unavailable)', !ok);
};


