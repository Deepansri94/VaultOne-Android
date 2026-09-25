/**
 * VaultOne — Google Sheets Migration Patch
 * Run from VaultOne-Updated folder:  node patch.js
 *
 * What it does:
 *  1. Creates src/api.js  (Sheets API layer, replaces IndexedDB helpers)
 *  2. Patches src/index.html        — inject api.js, remove openDB call, update subtitle
 *  3. Patches src/iVault.html       — inject api.js, update subtitle
 *  4. Patches src/FamilyVault.html  — inject api.js, update subtitle
 *  5. Patches src/PasswordVault.html— inject api.js, update subtitle
 *  6. Patches src/iVault.js         — remove `if (!db)` guards, fix `categories` field name
 *  7. Patches src/FamilyVault.js    — strip fileBlob before putOne, update subtitle text
 *  8. Patches src/PasswordVault.js  — update subtitle text
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');

// ── helpers ───────────────────────────────────────────────────────────────────
function read(file)        { return fs.readFileSync(path.join(SRC, file), 'utf8'); }
function write(file, text) { fs.writeFileSync(path.join(SRC, file), text, 'utf8'); console.log('  ✔ ' + file); }
function patch(file, fn)   { write(file, fn(read(file))); }

// ── 1. Create api.js ──────────────────────────────────────────────────────────
write('api.js', `'use strict';
// VaultOne — Google Sheets API layer
// Replaces IndexedDB helpers from shared.js.
// Must be loaded BEFORE shared.js in every HTML page.
//
// SETUP: Paste your Web App URL in Settings → Web App URL field.
// Stored in localStorage under 'vaultone_webappurl'.

const _API_KEY = 'vaultone_webappurl';

function _apiUrl() {
  const param = new URLSearchParams(location.search).get('url');
  if (param) { localStorage.setItem(_API_KEY, param); history.replaceState(null, '', location.pathname); }
  return localStorage.getItem(_API_KEY) || '';
}

async function _apiCall(payload) {
  const url = _apiUrl();
  if (!url) throw new Error('Web App URL not set. Open Settings and paste your Apps Script Web App URL.');
  const qs = url + '?p=' + encodeURIComponent(JSON.stringify(payload));
  const res = await fetch(qs, { redirect: 'follow' });
  if (!res.ok) throw new Error('Network error: ' + res.status);
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}

// Assigned on window to win over shared.js function-declaration hoisting
window.openDB     = async function(_d, _v, _s) {};
window.getAll     = async function(store)         { return _apiCall({ action: 'getAll',     store }); };
window.getOne     = async function(store, id)     { return _apiCall({ action: 'getOne',     store, id }); };
window.putOne     = async function(store, record) { return _apiCall({ action: 'putOne',     store, record }); };
window.delOne     = async function(store, id)     { return _apiCall({ action: 'delOne',     store, id }); };
window.clearStore = async function(store)         { return _apiCall({ action: 'clearStore', store }); };
window.bulkPut    = async function(store, records){ return _apiCall({ action: 'bulkPut',    store, records }); };

// Re-apply after all scripts load to guarantee we win over shared.js hoisting.
// Also set window.db sentinel so shared.js \`if (!db) return\` guards don't block.
document.addEventListener('DOMContentLoaded', () => {
  window.db         = { _sheets: true };
  window.openDB     = async function(_d, _v, _s) {};
  window.getAll     = async function(store)         { return _apiCall({ action: 'getAll',     store }); };
  window.getOne     = async function(store, id)     { return _apiCall({ action: 'getOne',     store, id }); };
  window.putOne     = async function(store, record) { return _apiCall({ action: 'putOne',     store, record }); };
  window.delOne     = async function(store, id)     { return _apiCall({ action: 'delOne',     store, id }); };
  window.clearStore = async function(store)         { return _apiCall({ action: 'clearStore', store }); };
  window.bulkPut    = async function(store, records){ return _apiCall({ action: 'bulkPut',    store, records }); };
});

// ── Settings UI ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!_apiUrl()) {
    const banner = document.createElement('div');
    banner.id = 'apiSetupBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999;background:#1e1040;border-bottom:2px solid #7c3aed;padding:14px 18px;display:flex;flex-wrap:wrap;gap:10px;align-items:center';
    banner.innerHTML = \`
      <span style="font-size:13px;color:#e2e8f0;flex:1;min-width:200px">☁️ Paste your Google Sheets Web App URL to get started</span>
      <input id="bannerUrlInput" placeholder="https://script.google.com/macros/s/..." style="flex:2;min-width:220px;padding:8px 12px;border-radius:10px;border:1px solid #7c3aed;background:#0b1627;color:#e2e8f0;font-size:13px">
      <button id="bannerSaveBtn" style="padding:8px 16px;background:#7c3aed;color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;white-space:nowrap">Save &amp; Connect</button>\`;
    document.body.prepend(banner);
    document.getElementById('bannerSaveBtn').onclick = async () => {
      const url = document.getElementById('bannerUrlInput').value.trim();
      if (!url) return;
      localStorage.setItem(_API_KEY, url);
      const btn = document.getElementById('bannerSaveBtn');
      btn.textContent = '⏳ Testing…';
      try {
        await _apiCall({ action: 'ping' });
        banner.remove(); location.reload();
      } catch(e) {
        btn.textContent = 'Save & Connect';
        document.getElementById('bannerUrlInput').style.borderColor = '#f87171';
        alert('❌ Could not connect: ' + e.message);
      }
    };
  }

  setTimeout(() => {
    const extra = document.getElementById('spModuleExtra');
    if (!extra) return;
    const saved = _apiUrl();
    extra.innerHTML = \`
      <hr style="border-color:#ffffff12;margin:16px 0">
      <h4 style="margin:0 0 10px;font-size:14px;color:#94a3b8">☁️ Google Sheets Sync</h4>
      <label style="display:block;margin-bottom:10px">Web App URL
        <input id="spWebAppUrl" placeholder="https://script.google.com/macros/s/..."
               value="\${saved || ''}" style="margin-top:4px;font-size:12px">
      </label>
      <div class="actions" style="margin-top:0">
        <button class="btn primary" id="spWebAppSave" style="font-size:12px;padding:6px 14px">Save URL</button>
        <button class="btn" id="spWebAppTest" style="font-size:12px;padding:6px 14px">Test Connection</button>
      </div>
      <div id="spWebAppStatus" style="font-size:12px;margin-top:8px;color:#94a3b8"></div>\`;

    document.getElementById('spWebAppSave').onclick = () => {
      const url = document.getElementById('spWebAppUrl').value.trim();
      if (!url) { document.getElementById('spWebAppStatus').textContent = '⚠️ Enter a URL first.'; return; }
      localStorage.setItem(_API_KEY, url);
      document.getElementById('spWebAppStatus').textContent = '✅ URL saved.';
      document.getElementById('apiSetupBanner')?.remove();
    };
    document.getElementById('spWebAppTest').onclick = async () => {
      const st = document.getElementById('spWebAppStatus');
      const typed = document.getElementById('spWebAppUrl').value.trim();
      if (typed) localStorage.setItem(_API_KEY, typed);
      st.textContent = '⏳ Testing…';
      try { await _apiCall({ action: 'ping' }); st.textContent = '✅ Connected to Google Sheets.'; document.getElementById('apiSetupBanner')?.remove(); }
      catch (e) { st.textContent = '❌ ' + e.message; }
    };
  }, 200);
});
`);

// ── 2. index.html ─────────────────────────────────────────────────────────────
patch('index.html', s => s
  // inject api.js before shared.js
  .replace('<script src="shared.js"></script>', '<script src="api.js"></script>\n<script src="shared.js"></script>')
  // update subtitle
  .replace('Offline-first · All data stays on your device', 'Google Sheets · All data synced to your sheet')
  // remove the openDB call — no longer needed
  .replace(/\/\* ===== Index page.*?openDB.*?\}\)\(\);/s, '/* openDB is a no-op in Sheets mode — api.js handles it */')
);

// ── 3. iVault.html ────────────────────────────────────────────────────────────
patch('iVault.html', s => s
  .replace('<script src="shared.js"></script>', '<script src="api.js"></script>\n<script src="shared.js"></script>')
  .replace('Personal Finance · Offline-first', 'Personal Finance · Cloud-synced')
);

// ── 4. FamilyVault.html ───────────────────────────────────────────────────────
patch('FamilyVault.html', s => s
  .replace('<script src="shared.js"></script>', '<script src="api.js"></script>\n<script src="shared.js"></script>')
  .replace('Documents · People · Offline-first', 'Documents · People · Cloud-synced')
  .replace('stored locally.', 'synced to Google Sheets.')
);

// ── 5. PasswordVault.html ─────────────────────────────────────────────────────
patch('PasswordVault.html', s => s
  .replace('<script src="shared.js"></script>', '<script src="api.js"></script>\n<script src="shared.js"></script>')
  .replace('Encrypted · Offline-first', 'Encrypted · Cloud-synced')
);

// ── 6. iVault.js ─────────────────────────────────────────────────────────────
patch('iVault.js', s => s
  // Remove `if (!db)` guards — db is now a sentinel, these would still pass
  // but the error message is misleading; replace with a no-op comment
  .replace(
    /if \(!db\) \{ toast\('Database not ready\. Please reload the page\.', true\); return; \}/g,
    '/* db sentinel set by api.js */'
  )
  // iVault.js sends `categories` object but old Code.gs expected `categoriesJson`
  // New Code.gs uses `categories` — no change needed here, already correct
  // Update applySettings subtitle
  .replace("'Personal Finance · Offline-first'", "'Personal Finance · Cloud-synced'")
);

// ── 7. FamilyVault.js ────────────────────────────────────────────────────────
patch('FamilyVault.js', s => s
  // Strip fileBlob before putOne('documents') — Sheets can't store binary
  .replace(
    "await putOne('documents', record);",
    "const _docRecord = { ...record }; delete _docRecord.fileBlob; delete _docRecord.fileBytes;\n    await putOne('documents', _docRecord);"
  )
  // Update applySettings subtitle
  .replace("'Documents · People · Offline-first'", "'Documents · People · Cloud-synced'")
);

// ── 8. PasswordVault.js ───────────────────────────────────────────────────────
patch('PasswordVault.js', s => s
  .replace("'Encrypted · Offline-first'", "'Encrypted · Cloud-synced'")
);

console.log('\nDone. All patches applied to src/');
console.log('\nNext steps:');
console.log('  1. Copy src/Code.gs into your Google Sheet → Extensions → Apps Script');
console.log('  2. Run setupSheets() to create the new tabs (Persons, Households, Vehicles, Documents, Passwords)');
console.log('  3. Deploy a new version of the Web App');
console.log('  4. Serve the src/ folder and open index.html');
