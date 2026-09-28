'use strict';
// VaultOne — Dual-write layer: IndexedDB (fast, local) + Google Sheets (permanent backup)
// Reads always come from IndexedDB. Writes go to IndexedDB first, then Sheets in background.
// On first load (per session), if a Sheets URL is set, data is pulled from Sheets → IndexedDB.
//
// SETUP: Paste your Web App URL in Settings → Web App URL field.
// Stored in localStorage under 'vaultone_webappurl'.

const _API_KEY = 'vaultone_webappurl';

function _apiUrl() {
  const param = new URLSearchParams(location.search).get('url');
  if (param) { localStorage.setItem(_API_KEY, param); history.replaceState(null, '', location.pathname); }
  return localStorage.getItem(_API_KEY) || (window.VAULTONE_CONFIG && window.VAULTONE_CONFIG.WEB_APP_URL) || '';
}

const _WRITE_ACTIONS = { putOne: true, delOne: true, clearStore: true, bulkPut: true };
const _RETRY_DELAY = ms => new Promise(r => setTimeout(r, ms));

async function _apiCall(payload, _attempt = 0) {
  const url = _apiUrl();
  if (!url) throw new Error('Web App URL not set. Open Settings and paste your Apps Script Web App URL.');
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    if (_attempt < 2) { await _RETRY_DELAY(800); return _apiCall(payload, _attempt + 1); }
    _notifyWriteError(payload, e.message);
    throw e;
  }
  if ((res.status === 404 || res.status >= 500) && _attempt < 2) {
    await _RETRY_DELAY(800);
    return _apiCall(payload, _attempt + 1);
  }
  if (!res.ok) {
    const err = new Error('Network error: ' + res.status);
    _notifyWriteError(payload, err.message);
    throw err;
  }
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) {
    if (_attempt < 2) { await _RETRY_DELAY(800); return _apiCall(payload, _attempt + 1); }
    const err = new Error('Non-JSON response from Sheets');
    _notifyWriteError(payload, err.message);
    throw err;
  }
  const data = await res.json();
  if (data && data.error && data.error.startsWith('Unknown action') && _attempt < 2) {
    await _RETRY_DELAY(800);
    return _apiCall(payload, _attempt + 1);
  }
  if (data && data.error) {
    const err = new Error(data.error);
    _notifyWriteError(payload, data.error);
    throw err;
  }
  return data;
}

function _notifyWriteError(payload, msg) {
  if (!_WRITE_ACTIONS[payload.action]) return;
  const label = payload.store ? payload.store + ' / ' + payload.action : payload.action;
  const toastEl = document.getElementById('toast');
  if (toastEl && typeof toast === 'function') {
    toast('❌ Sheets sync failed (' + label + '). Data saved locally.', true);
  } else {
    let banner = document.getElementById('_apiErrBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = '_apiErrBanner';
      banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#7d2738;color:#fff;font-size:13px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;gap:10px';
      banner.innerHTML = '<span id="_apiErrMsg"></span><button style="background:none;border:1px solid #fff9;color:#fff;border-radius:8px;padding:4px 12px;cursor:pointer" onclick="this.parentElement.remove()">✕</button>';
      document.body.appendChild(banner);
    }
    document.getElementById('_apiErrMsg').textContent = '❌ Sheets sync failed (' + label + '). Data saved locally.';
    setTimeout(() => banner.remove(), 5000);
  }
}

// ── Background Sheets write (fire-and-forget, never blocks the UI) ──────────
function _sheetsWrite(payload) {
  if (!_apiUrl()) return; // no URL configured — skip silently
  _apiCall(payload).catch(() => {}); // errors already shown by _notifyWriteError
}

// ── Session hydration: pull Sheets → IndexedDB once per session ─────────────
const _HYDRATED_KEY = 'vaultone_hydrated_session';
const _hydrated = new Set();

async function _hydrateStore(store) {
  if (_hydrated.has(store)) return;
  _hydrated.add(store);
  try {
    const rows = await _apiCall({ action: 'getAll', store });
    if (!Array.isArray(rows) || !rows.length) return;
    // Write each row into IndexedDB without triggering another Sheets write
    for (const row of rows) {
      await _idbPutOne(store, row);
    }
  } catch { /* offline or URL not set — silently skip */ }
}

// ── Raw IndexedDB helpers (bypass the dual-write wrappers) ──────────────────
function _idbTxStore(store, mode) { return db.transaction(store, mode).objectStore(store); }
function _idbReq(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function _idbGetAll(store)          { return _idbReq(_idbTxStore(store).getAll()); }
async function _idbGetOne(store, id)      { return _idbReq(_idbTxStore(store).get(id)); }
async function _idbPutOne(store, obj)     { return _idbReq(_idbTxStore(store, 'readwrite').put(obj)); }
async function _idbDelOne(store, id)      { return _idbReq(_idbTxStore(store, 'readwrite').delete(id)); }
async function _idbClearStore(store)      { return _idbReq(_idbTxStore(store, 'readwrite').clear()); }

// ── Dual-write CRUD overrides ────────────────────────────────────────────────
// These replace the shared.js window.* assignments after DOMContentLoaded.
// Reads: IndexedDB only (fast).
// Writes: IndexedDB first (immediate), then Sheets in background.

function _installDualWrite() {
  window.getAll = async function(store) {
    await _hydrateStore(store);
    return _idbGetAll(store);
  };

  window.getOne = async function(store, id) {
    await _hydrateStore(store);
    return _idbGetOne(store, id);
  };

  window.putOne = async function(store, obj) {
    const result = await _idbPutOne(store, obj);
    _sheetsWrite({ action: 'putOne', store, record: obj });
    return result;
  };

  window.delOne = async function(store, id) {
    const result = await _idbDelOne(store, id);
    _sheetsWrite({ action: 'delOne', store, id });
    return result;
  };

  window.clearStore = async function(store) {
    const result = await _idbClearStore(store);
    _sheetsWrite({ action: 'clearStore', store });
    return result;
  };

  window.bulkPut = async function(store, records) {
    for (const r of records) await _idbPutOne(store, r);
    _sheetsWrite({ action: 'bulkPut', store, records });
  };
}

document.addEventListener('DOMContentLoaded', () => {
  // Wait for openDB to finish (shared.js sets db synchronously in onsuccess)
  // Use a small poll to ensure db is ready before installing overrides
  const _tryInstall = () => {
    if (typeof db !== 'undefined' && db) {
      _installDualWrite();
    } else {
      setTimeout(_tryInstall, 50);
    }
  };
  _tryInstall();
});

// ── Settings UI ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!_apiUrl()) {
    const banner = document.createElement('div');
    banner.id = 'apiSetupBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999;background:#1e1040;border-bottom:2px solid #7c3aed;padding:14px 18px;display:flex;flex-wrap:wrap;gap:10px;align-items:center';
    banner.innerHTML = `
      <span style="font-size:13px;color:#e2e8f0;flex:1;min-width:200px">☁️ Paste your Google Sheets Web App URL to enable cloud backup</span>
      <input id="bannerUrlInput" placeholder="https://script.google.com/macros/s/..." style="flex:2;min-width:220px;padding:8px 12px;border-radius:10px;border:1px solid #7c3aed;background:#0b1627;color:#e2e8f0;font-size:13px">
      <button id="bannerSaveBtn" style="padding:8px 16px;background:#7c3aed;color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;white-space:nowrap">Save &amp; Connect</button>`;
    document.body.prepend(banner);
    document.getElementById('bannerSaveBtn').onclick = async () => {
      const url = document.getElementById('bannerUrlInput').value.trim();
      if (!url) return;
      localStorage.setItem(_API_KEY, url);
      const btn = document.getElementById('bannerSaveBtn');
      btn.textContent = '⏳ Testing…';
      try {
        await _apiCall({ action: 'ping' });
        banner.remove();
      } catch(e) {
        btn.textContent = 'Save & Connect';
        document.getElementById('bannerUrlInput').style.borderColor = '#f87171';
        const st = document.createElement('div');
        st.style.cssText = 'color:#f87171;font-size:12px;margin-top:6px;width:100%';
        st.textContent = '❌ Could not connect: ' + e.message;
        banner.appendChild(st);
        setTimeout(() => st.remove(), 4000);
      }
    };
  }

  function _buildUrlPanel() {
    const extra = document.getElementById('spModuleExtra');
    if (!extra) return;
    const saved = _apiUrl();
    extra.innerHTML = `
      <hr style="border-color:#ffffff12;margin:16px 0">
      <h4 style="margin:0 0 6px;font-size:14px;color:#94a3b8">☁️ Google Sheets Backup</h4>
      <p style="font-size:12px;color:#64748b;margin:0 0 10px">Data saves locally first, then syncs to Sheets in the background.</p>
      <div id="spWebAppConnected" style="display:${saved ? 'flex' : 'none'};align-items:center;gap:8px;margin-bottom:10px;font-size:13px;color:#34d399">
        ✅ Connected
        <button class="btn" id="spWebAppChange" style="font-size:11px;padding:4px 10px">Change URL</button>
      </div>
      <div id="spWebAppForm" style="display:${saved ? 'none' : 'block'}">
        <label style="display:block;margin-bottom:10px">Web App URL
          <input id="spWebAppUrl" placeholder="https://script.google.com/macros/s/..."
                 value="${saved || ''}" style="margin-top:4px;font-size:12px">
        </label>
        <div class="actions" style="margin-top:0">
          <button class="btn primary" id="spWebAppSave" style="font-size:12px;padding:6px 14px">Save URL</button>
          <button class="btn" id="spWebAppTest" style="font-size:12px;padding:6px 14px">Test Connection</button>
        </div>
      </div>
      <div id="spWebAppStatus" style="font-size:12px;margin-top:8px;color:#94a3b8"></div>`;

    document.getElementById('spWebAppChange')?.addEventListener('click', () => {
      document.getElementById('spWebAppConnected').style.display = 'none';
      document.getElementById('spWebAppForm').style.display = 'block';
      document.getElementById('spWebAppUrl').value = _apiUrl();
    });
    document.getElementById('spWebAppSave').onclick = () => {
      const url = document.getElementById('spWebAppUrl').value.trim();
      if (!url) { document.getElementById('spWebAppStatus').textContent = '⚠️ Enter a URL first.'; return; }
      localStorage.setItem(_API_KEY, url);
      document.getElementById('spWebAppStatus').textContent = '✅ URL saved.';
      document.getElementById('spWebAppConnected').style.display = 'flex';
      document.getElementById('spWebAppForm').style.display = 'none';
      document.getElementById('apiSetupBanner')?.remove();
    };
    document.getElementById('spWebAppTest').onclick = async () => {
      const st = document.getElementById('spWebAppStatus');
      const typed = document.getElementById('spWebAppUrl').value.trim();
      if (typed) localStorage.setItem(_API_KEY, typed);
      st.textContent = '⏳ Testing…';
      try {
        await _apiCall({ action: 'ping' });
        st.textContent = '✅ Connected to Google Sheets.';
        document.getElementById('spWebAppConnected').style.display = 'flex';
        document.getElementById('spWebAppForm').style.display = 'none';
        document.getElementById('apiSetupBanner')?.remove();
      }
      catch (e) { st.textContent = '❌ ' + e.message; }
    };
  }

  setTimeout(_buildUrlPanel, 200);
  document.addEventListener('click', e => {
    if (e.target.id === 'settingsBtn' || e.target.closest('#settingsBtn')) {
      setTimeout(_buildUrlPanel, 250);
    }
  });
});
