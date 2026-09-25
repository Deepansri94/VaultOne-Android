'use strict';
/* ===== FamilyVault — own IndexedDB ===== */
const FV_DB = 'FamilyVaultDB';
const FV_VER = 1;
const FV_STORES = ['meta', 'persons', 'households', 'vehicles', 'documents', 'reminders', 'activity', 'notes'];

let state = { settings: { id: 'settings', name: '', currency: 'INR' } };
let _cache = { persons: [], households: [], vehicles: [], documents: [] };
let _activeTile = null;

/* ===== Boot ===== */
(async () => {
  try {
    await openDB(FV_DB, FV_VER, FV_STORES);
    if (window.db && window.db._sheets) {
      try { const ls = JSON.parse(localStorage.getItem('vaultone_settings') || '{}'); if (ls.name || ls.currency) state.settings = { ...state.settings, ...ls }; } catch {}
    } else {
      const s = await getOne('meta', 'settings');
      if (s) state.settings = { ...state.settings, ...s };
    }
    applySettings();
    await refreshFamily();
    renderBellReminders();
    updateNotificationStatus();
    appendSettingsPanelSection(`
      <hr style="border-color:#ffffff12;margin:16px 0">
      <h4 style="margin:0 0 12px;font-size:14px;color:#94a3b8">💾 Backup &amp; Restore</h4>
      <div class="actions" style="margin-top:0">
        <button class="btn primary" id="spFvExportBtn">⬇️ Export JSON</button>
        <button class="btn" id="spFvImportBtn">⬆️ Import JSON</button>
        <input id="spFvImportFile" type="file" accept="application/json" hidden>
      </div>
      <hr style="border-color:#ffffff12;margin:16px 0">
      <div class="dangerbox" style="margin-top:0">
        <p class="muted" style="margin:0 0 10px;font-size:13px">Permanently deletes all FamilyVault data on this device.</p>
        <button class="btn danger" id="spFvClearBtn">🗑️ Clear All FamilyVault Data</button>
      </div>`);
    setTimeout(() => {
      document.getElementById('spFvExportBtn')?.addEventListener('click', async () => {
        try {
          const data = await exportJSON('FamilyVault', FV_STORES);
          const result = saveBackupFile(JSON.stringify(data,null,2), 'FamilyVault_Backup_'+today()+'.json');
          await logActivity('Backup','JSON backup exported'); toast(result);
        } catch(e) { toast('Export failed: '+e.message, true); }
      });
      document.getElementById('spFvImportBtn')?.addEventListener('click', () => {
        document.getElementById('spFvImportFile').value='';
        document.getElementById('spFvImportFile').onchange = async () => {
          try {
            const f = document.getElementById('spFvImportFile').files?.[0]; if(!f) return;
            const data = JSON.parse(await f.text());
            if (await importJSON(data,'FamilyVault',FV_STORES)) {
              const s = await getOne('meta','settings');
              if(s) state.settings={...state.settings,...s};
              applySettings(); await refreshFamily(); renderBellReminders();
              toast('Import completed');
            }
          } catch(e) { toast('Import failed: '+e.message, true); }
        };
        document.getElementById('spFvImportFile').click();
      });
      document.getElementById('spFvClearBtn')?.addEventListener('click', () => {
        openModal('Clear All FamilyVault Data', `<div class="dangerbox"><p><b>This permanently deletes all FamilyVault data on this device.</b></p></div>
          <form id="fvClearForm"><label>Type DELETE to confirm<input name="confirm" required placeholder="Type DELETE" autocomplete="off"></label>
          <div class="actions"><button class="btn danger">Confirm &amp; Clear</button><button type="button" class="btn" id="fvCancelClear">Cancel</button></div></form>`,
          async fd => {
            if (String(fd.get('confirm')||'').trim().toUpperCase() !== 'DELETE') { toast('Type DELETE exactly', true); return; }
            for (const s of FV_STORES) await clearStore(s);
            state.settings = { id:'settings', name:'', currency:'INR' };
            await putOne('meta', state.settings);
            _cache = { persons:[], households:[], vehicles:[], documents:[] };
            closeModal(); toast('All FamilyVault data cleared');
            applySettings(); await refreshFamily();
          });
        setTimeout(() => { document.getElementById('fvCancelClear')?.addEventListener('click', closeModal); }, 0);
      });
    }, 100);
  } catch (e) {
    document.body.innerHTML = `<div style="padding:30px;color:white"><h2>FamilyVault could not load</h2><p>${esc(e.message)}</p><button onclick="location.reload()">Retry</button></div>`;
  }
})();

function applySettings() {
  const s = state.settings;
  $('profileLine').textContent = s.name ? s.name + ' · FamilyVault' : 'Documents · People · Cloud-synced';
}

async function refreshFamily() {
  const [persons, households, vehicles, documents] = await Promise.all([
    getAll('persons'), getAll('households'), getAll('vehicles'), getAll('documents')
  ]);
  _cache = { persons, households, vehicles, documents };
  $('cntPeople').textContent = persons.length;
  $('cntHouses').textContent = households.length;
  $('cntVehicles').textContent = vehicles.length;
  $('cntDocs').textContent = documents.length;
  $('familySubPanel').style.display = 'block';
  $('docToolbar').style.display = 'flex';
  renderTree();
}

function showTileContent() { renderTree(); }

/* ===== Helpers ===== */
function _cleanDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

function formatAge(dob) {
  const clean = _cleanDate(dob);
  if (!clean) return 'DOB not set';
  const birth = new Date(clean + 'T00:00:00');
  if (Number.isNaN(birth.getTime())) return 'Invalid DOB';
  const now = new Date();
  if (birth > now) return 'DOB is in the future';
  let y = now.getFullYear() - birth.getFullYear();
  let m = now.getMonth() - birth.getMonth();
  let d = now.getDate() - birth.getDate();
  if (d < 0) { m--; d += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  return `${y} Years, ${m} Months, ${d} Days`;
}

function maskDocNum(v) {
  const s = String(v || '').trim();
  if (!s) return 'Not provided';
  if (s.length <= 4) return '•'.repeat(s.length);
  return '•'.repeat(Math.max(4, s.length - 4)) + s.slice(-4);
}

function calcExpiry(d) { const n = daysUntil(d); return n !== null && n <= 30; }

/* ===== Tree View ===== */
function renderTree() {
  const list = $('familyList');
  const { persons, households, vehicles, documents } = _cache;
  const q = ($('docSearch')?.value || '').toLowerCase();

  if (!households.length && !persons.length && !vehicles.length) {
    list.innerHTML = '<div class="empty">No records yet. Add a household first, then people.</div>';
    return;
  }

  let html = '';

  // Households
  households.forEach((hh, hi) => {
    const members = persons.filter(p => p.householdId === hh.id);
    const hhdocs  = documents.filter(d => d.ownerType === 'Household' && d.householdId === hh.id);
    if (q) {
      const hhMatch  = [hh.name, hh.description, hh.address].some(v => String(v||'').toLowerCase().includes(q));
      const memMatch = members.some(p => [p.name, p.relation].some(v => String(v||'').toLowerCase().includes(q)));
      if (!hhMatch && !memMatch) return;
    }
    const hhId = 'hh_' + hi;
    html += `<div class="tree-hh">
      <div class="tree-hh-hdr" data-toggle="${hhId}">
        <div>
          <b>🏠 ${esc(hh.name)}</b>
          ${hh.description ? `<span class="tree-meta"> · ${esc(hh.description)}</span>` : ''}
          ${hh.address ? `<div class="tree-addr">${esc(hh.address.split('\n')[0])}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn-icon" data-hedit="${hh.id}" title="Edit household">✏️</button>
          <span class="tree-chev" id="chev_${hhId}">▼</span>
        </div>
      </div>
      <div class="tree-kids" id="kids_${hhId}">`;

    hhdocs.forEach(d => { html += docRow(d, 24); });

    members.forEach((p, pi) => {
      const pdocs = documents.filter(d => d.ownerType === 'Person' && d.personId === p.id);
      const pId = hhId + '_p' + pi;
      const dobClean = _cleanDate(p.dob);
      html += `<div class="tree-person">
        <div class="tree-person-hdr" data-toggle="${pId}">
          <div>
            <span class="tree-branch">└─</span>
            <b class="tree-pname">${esc(p.name)}</b>
            <span class="tree-meta">${esc(p.relation)}${p.gender ? ' · ' + esc(p.gender) : ''}${dobClean ? ' · ' + dobClean : ''}</span>
            <span class="tree-age">${dobClean ? '🎂 ' + formatAge(dobClean) : ''}</span>
            <span class="tree-status ${p.status === 'Inactive' ? 'inactive' : 'active'}">${p.status === 'Inactive' ? '⚪' : '🟢'}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn-icon" data-pedit="${p.id}" title="Edit person">✏️</button>
            <button class="btn-icon danger" data-pdel="${p.id}" title="Delete">🗑️</button>
            <span class="tree-chev" id="chev_${pId}">${pdocs.length ? '▼' : ''}</span>
          </div>
        </div>`;
      if (pdocs.length) {
        html += `<div class="tree-kids" id="kids_${pId}">`;
        pdocs.forEach(d => { html += docRow(d, 44); });
        html += `</div>`;
      }
      html += `</div>`;
    });

    if (!members.length && !hhdocs.length)
      html += `<div class="tree-empty">No members or documents</div>`;

    html += `</div></div>`;
  });

  // Unassigned people
  const unassigned = persons.filter(p => !p.householdId || !households.find(h => h.id === p.householdId));
  if (unassigned.length) {
    html += `<div class="tree-hh">
      <div class="tree-hh-hdr" data-toggle="ua">
        <b>👤 Unassigned People (${unassigned.length})</b>
        <span class="tree-chev" id="chev_ua">▼</span>
      </div>
      <div class="tree-kids" id="kids_ua">`;
    unassigned.forEach(p => {
      const dobClean = _cleanDate(p.dob);
      html += `<div class="tree-person">
        <div class="tree-person-hdr" style="cursor:default">
          <div>
            <b class="tree-pname">${esc(p.name)}</b>
            <span class="tree-meta">${esc(p.relation)}${dobClean ? ' · ' + dobClean : ''}</span>
            <span class="tree-age">${dobClean ? '🎂 ' + formatAge(dobClean) : ''}</span>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn-icon" data-pedit="${p.id}">✏️</button>
            <button class="btn-icon danger" data-pdel="${p.id}">🗑️</button>
          </div>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  }

  // Vehicles — each vehicle is collapsible and shows its own docs underneath
  if (vehicles.length) {
    html += `<div class="tree-hh">
      <div class="tree-hh-hdr" data-toggle="veh">
        <b>🚗 Vehicles (${vehicles.length})</b>
        <span class="tree-chev" id="chev_veh">▼</span>
      </div>
      <div class="tree-kids" id="kids_veh">`;
    vehicles.forEach((v, vi) => {
      const vdocs = documents.filter(d => d.ownerType === 'Vehicle' && d.vehicleId === v.id);
      const vId = 'veh_' + vi;
      html += `<div class="tree-person">
        <div class="tree-person-hdr" data-toggle="${vId}">
          <div>
            <span class="tree-branch">└─</span>
            <b style="font-size:13px">${esc(v.name || v.registrationNumber)}</b>
            <span class="tree-meta">${esc(v.type || '')}${v.make ? ' · ' + esc(v.make) : ''}${v.model ? ' ' + esc(v.model) : ''}${v.year ? ' (' + esc(v.year) + ')' : ''}</span>
            <div style="font-size:11px;color:#64748b;margin-top:2px">Reg: ${esc(v.registrationNumber || '—')} · Owner: ${esc(v.ownerPersonName || '—')}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn-icon" data-vedit="${v.id}" title="Edit">✏️</button>
            <button class="btn-icon danger" data-vdel="${v.id}" title="Delete">🗑️</button>
            <button class="btn-icon" data-vdocadd="${v.id}" title="Add vehicle document">📄+</button>
            <span class="tree-chev" id="chev_${vId}">${vdocs.length ? '▼' : ''}</span>
          </div>
        </div>`;
      if (vdocs.length) {
        html += `<div class="tree-kids" id="kids_${vId}">`;
        vdocs.forEach(d => { html += docRow(d, 44); });
        html += `</div>`;
      }
      html += `</div>`;
    });
    html += `</div></div>`;
  }

  list.innerHTML = html || '<div class="empty">No results.</div>';

  // Collapse toggles
  list.querySelectorAll('[data-toggle]').forEach(hdr => {
    hdr.style.cursor = 'pointer';
    hdr.onclick = e => {
      if (e.target.closest('button')) return;
      const id = hdr.dataset.toggle;
      const kids = document.getElementById('kids_' + id);
      const chev = document.getElementById('chev_' + id);
      if (!kids) return;
      const collapsed = kids.style.display === 'none';
      kids.style.display = collapsed ? '' : 'none';
      if (chev) chev.textContent = collapsed ? '▼' : '▶';
    };
  });

  list.querySelectorAll('[data-pedit]').forEach(b => b.onclick = () => personModal(_cache.persons.find(x => x.id === b.dataset.pedit)));
  list.querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => {
    const p = _cache.persons.find(x => x.id === b.dataset.pdel);
    if (!confirm(`Delete ${p?.name || 'this person'}?`)) return;
    await delOne('persons', b.dataset.pdel);
    await logActivity('Family', 'Person deleted');
    await refreshFamily();
  });
  list.querySelectorAll('[data-hedit]').forEach(b => b.onclick = () => householdModal(_cache.households.find(x => x.id === b.dataset.hedit)));
  list.querySelectorAll('[data-vedit]').forEach(b => b.onclick = () => vehicleModal(_cache.vehicles.find(x => x.id === b.dataset.vedit)));
  list.querySelectorAll('[data-vdocadd]').forEach(b => b.onclick = () => docModal(null, b.dataset.vdocadd));
  list.querySelectorAll('[data-vdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this vehicle?')) return;
    await delOne('vehicles', b.dataset.vdel);
    await logActivity('Family', 'Vehicle deleted');
    await refreshFamily();
  });
  list.querySelectorAll('[data-dedit]').forEach(b => b.onclick = () => docModal(_cache.documents.find(x => x.id === b.dataset.dedit)));
  list.querySelectorAll('[data-ddel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this document?')) return;
    await delOne('documents', b.dataset.ddel);
    await logActivity('Document', 'Document deleted');
    await refreshFamily();
  });
  list.querySelectorAll('[data-dview]').forEach(b => b.onclick = () => docDetails(b.dataset.dview));
}

function docRow(d, indent) {
  const warn = d.expiryDate && calcExpiry(_cleanDate(d.expiryDate));
  const exp = _cleanDate(d.expiryDate);
  return `<div class="tree-doc" style="padding-left:${indent}px">
    <div>
      <span class="tree-branch">└─</span>
      <b style="font-size:11px">${esc(d.title)}</b>
      <span class="tree-meta">${esc(d.type || '')}</span>
      ${exp ? `<span style="font-size:10px;color:#94a3b8">${exp}</span>` : ''}
      ${warn ? `<span style="color:#d97706;font-size:10px;font-weight:700"> ⚠️ Expiring</span>` : ''}
    </div>
    <div style="display:flex;gap:4px">
      <button class="btn-icon" data-dview="${d.id}" title="Details">👁️</button>
      <button class="btn-icon" data-dedit="${d.id}" title="Edit">✏️</button>
      <button class="btn-icon danger" data-ddel="${d.id}" title="Delete">🗑️</button>
    </div>
  </div>`;
}

/* ===== People ===== */
function renderPeople() { renderTree(); }

function personModal(existing = null) {
  const { households } = _cache;
  const hOpts = households.map(h => `<option value="${h.id}" ${existing?.householdId === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('');
  openModal(existing ? 'Edit Person' : 'Add Person', `<form class="grid">
    <label>Full Name <span class="req-star">*</span><input name="name" required value="${esc(existing?.name || '')}"></label>
    <label>Relationship <span class="req-star">*</span><input name="relation" required value="${esc(existing?.relation || 'Member')}" placeholder="Member, Spouse, Child..."></label>
    <label>Household <span class="req-star">*</span>
      <select name="householdId" required>
        <option value="">Select household</option>${hOpts}
      </select>
    </label>
    <label>Date of Birth<input name="dob" type="date" value="${esc(_cleanDate(existing?.dob || ''))}"></label>
    <label>Gender<select name="gender">
      <option value="">Select</option>
      <option ${existing?.gender === 'Male' ? 'selected' : ''}>Male</option>
      <option ${existing?.gender === 'Female' ? 'selected' : ''}>Female</option>
      <option ${existing?.gender === 'Other' ? 'selected' : ''}>Other</option>
    </select></label>
    <label>Status<select name="status">
      <option ${existing?.status !== 'Inactive' ? 'selected' : ''}>Active</option>
      <option ${existing?.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
    </select></label>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save</button></div>
  </form>`, async fd => {
    const h = households.find(x => x.id === fd.get('householdId'));
    const record = {
      id: existing?.id || uid(),
      name: fd.get('name').trim(), relation: fd.get('relation').trim() || 'Member',
      householdId: h?.id || '', householdName: h?.name || '',
      dob: fd.get('dob') || '', gender: fd.get('gender') || '',
      status: fd.get('status') || 'Active',
      createdAt: existing?.createdAt || new Date().toISOString(),
      modifiedAt: new Date().toISOString()
    };
    await putOne('persons', record);
    await logActivity('Family', (existing ? 'Person updated: ' : 'Person added: ') + record.name);
    if (record.dob && record.status === 'Active') {
      const remId = 'bday-' + record.id;
      const [, mm, dd] = record.dob.split('-');
      const thisYear = new Date().getFullYear();
      const bdayThisYear = `${thisYear}-${mm}-${dd}`;
      const bdate = new Date(bdayThisYear + 'T00:00:00');
      const bdayDate = bdate < new Date() ? `${thisYear + 1}-${mm}-${dd}` : bdayThisYear;
      await putOne('reminders', {
        id: remId, title: '🎂 Birthday: ' + record.name,
        date: bdayDate, time: '09:00', priority: 'Normal',
        description: 'DOB: ' + record.dob,
        completed: false, repeat: 'yearly', source: 'birthday', personId: record.id,
        createdAt: new Date().toISOString()
      });
    } else if (record.status === 'Inactive') {
      await delOne('reminders', 'bday-' + record.id).catch(() => {});
    }
    closeModal(); toast(existing ? 'Person updated' : 'Person added');
    await refreshFamily();
    renderBellReminders();
  });
}

$('addPersonBtn').onclick = () => personModal();

/* ===== Households ===== */
function renderHouseholds() { renderTree(); }

function householdModal(existing = null) {
  openModal(existing ? 'Edit Household' : 'Add Household', `<form class="grid">
    <label>Household Name <span class="req-star">*</span><input name="name" required value="${esc(existing?.name || '')}"></label>
    <label>Description<input name="description" value="${esc(existing?.description || '')}" placeholder="Optional"></label>
    <label style="grid-column:1/-1">Address<textarea name="address" rows="3" placeholder="House / Flat, Street, Area, City, State, PIN">${esc(existing?.address || '')}</textarea></label>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save</button></div>
  </form>`, async fd => {
    const record = {
      id: existing?.id || uid(),
      name: fd.get('name').trim(), description: fd.get('description').trim(),
      address: fd.get('address').trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
      modifiedAt: new Date().toISOString()
    };
    await putOne('households', record);
    await logActivity('Family', (existing ? 'Household updated: ' : 'Household added: ') + record.name);
    closeModal(); toast(existing ? 'Household updated' : 'Household added');
    await refreshFamily();
  });
}

$('addHouseBtn').onclick = () => householdModal();

/* ===== Vehicles ===== */
function renderVehicles() { renderTree(); }

function vehicleModal(existing = null) {
  const { persons } = _cache;
  const pOpts = persons.filter(p => (p.status || 'Active') === 'Active').map(p => `<option value="${p.id}" ${existing?.ownerPersonId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  openModal(existing ? 'Edit Vehicle' : 'Add Vehicle', `<form class="grid">
    <label>Type<select name="type">${['Car','Bike','Scooter','Commercial','Other'].map(t => `<option ${existing?.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label>Nickname / Name <span class="req-star">*</span><input name="name" required value="${esc(existing?.name || '')}"></label>
    <label>Registration Number <span class="req-star">*</span><input name="registrationNumber" required value="${esc(existing?.registrationNumber || '')}" placeholder="e.g. KA01AB1234"></label>
    <label>Make<input name="make" value="${esc(existing?.make || '')}" placeholder="e.g. Maruti"></label>
    <label>Model<input name="model" value="${esc(existing?.model || '')}" placeholder="e.g. Swift"></label>
    <label>Year<input name="year" type="number" min="1950" max="2100" value="${esc(existing?.year || '')}"></label>
    <label>Owner <span class="req-star">*</span><select name="ownerPersonId" required><option value="">Select person</option>${pOpts}</select></label>
    <label style="grid-column:1/-1">Notes<textarea name="notes">${esc(existing?.notes || '')}</textarea></label>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save</button></div>
  </form>`, async fd => {
    const owner = persons.find(p => p.id === fd.get('ownerPersonId'));
    if (!owner) { toast('Please select a valid owner', true); return; }
    const record = {
      id: existing?.id || uid(),
      type: fd.get('type') || 'Car', name: fd.get('name').trim(),
      registrationNumber: fd.get('registrationNumber').trim(),
      make: fd.get('make').trim(), model: fd.get('model').trim(),
      year: fd.get('year').trim(), ownerPersonId: owner.id, ownerPersonName: owner.name,
      notes: fd.get('notes').trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
      modifiedAt: new Date().toISOString()
    };
    await putOne('vehicles', record);
    await logActivity('Family', (existing ? 'Vehicle updated: ' : 'Vehicle added: ') + record.name);
    closeModal(); toast(existing ? 'Vehicle updated' : 'Vehicle added');
    await refreshFamily();
  });
}

$('addVehicleBtn').onclick = () => vehicleModal();

/* ===== Documents ===== */
function applyDocFilters() { renderTree(); }
$('docSearch').oninput = () => renderTree();
$('docTypeFilter').onchange = () => renderTree();

const VEHICLE_DOC_TYPES = [
  'Registration Certificate','Pollution Certificate','Road Tax',
  'Fitness Certificate','Insurance','Driving Licence','Vehicle','Other'
];
const GENERAL_DOC_TYPES = [
  'Aadhaar','PAN','Passport','Driving Licence','Ration Card','Insurance',
  'Registration Certificate','Pollution Certificate','Road Tax','Fitness Certificate',
  'Education','Employment','Property','Vehicle','Certificate','Other'
];

function docModal(existing = null, presetVehicleId = null) {
  const { persons, households, vehicles } = _cache;
  const pOpts = persons.map(p => `<option value="${p.id}" ${existing?.personId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const hOpts = households.map(h => `<option value="${h.id}" ${existing?.householdId === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('');
  const vOpts = vehicles.map(v => `<option value="${v.id}" ${(existing?.vehicleId || presetVehicleId) === v.id ? 'selected' : ''}>${esc(v.name || v.registrationNumber)}</option>`).join('');
  const typeOpts = GENERAL_DOC_TYPES.map(t => `<option ${existing?.type === t ? 'selected' : ''}>${t}</option>`).join('');
  const presetOwner = existing?.ownerType || (presetVehicleId ? 'Vehicle' : '');

  openModal(existing ? 'Edit Document' : 'Add Document', `<form class="grid">
    <label>Document Name <span class="req-star">*</span><input name="title" required value="${esc(existing?.title || '')}"></label>
    <label>Type <span class="req-star">*</span><select name="type" required><option value="">Select type</option>${typeOpts}</select></label>
    <label>Owner Type <span class="req-star">*</span>
      <select name="ownerType" id="ownerTypeSelect" required>
        <option value="">Select</option>
        <option ${presetOwner === 'Person'    ? 'selected' : ''}>Person</option>
        <option ${presetOwner === 'Household' ? 'selected' : ''}>Household</option>
        <option ${presetOwner === 'Vehicle'   ? 'selected' : ''}>Vehicle</option>
      </select>
    </label>
    <label id="personSelWrap"  ${presetOwner && presetOwner !== 'Person'    ? 'style="display:none"' : ''}>Person<select name="personId"><option value="">Select person</option>${pOpts}</select></label>
    <label id="houseSelWrap"   ${presetOwner !== 'Household' ? 'style="display:none"' : ''}>Household<select name="householdId"><option value="">Select household</option>${hOpts}</select></label>
    <label id="vehicleSelWrap" ${presetOwner !== 'Vehicle'   ? 'style="display:none"' : ''}>Vehicle<select name="vehicleId"><option value="">Select vehicle</option>${vOpts}</select></label>
    <label>Document Number <span class="req-star">*</span><input name="documentNumber" required value="${esc(existing?.documentNumber || '')}"></label>
    <label>Issue Date<input name="issueDate" type="date" value="${esc(_cleanDate(existing?.issueDate || ''))}"></label>
    <label>Expiry Date<input name="expiryDate" type="date" value="${esc(_cleanDate(existing?.expiryDate || ''))}"></label>
    <label style="grid-column:1/-1">Notes<textarea name="notes">${esc(existing?.notes || '')}</textarea></label>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save Document</button></div>
  </form>`, async fd => {
    const ownerType = fd.get('ownerType');
    const p = ownerType === 'Person'    ? persons.find(x => x.id === fd.get('personId'))       : null;
    const h = ownerType === 'Household' ? households.find(x => x.id === fd.get('householdId')) : null;
    const v = ownerType === 'Vehicle'   ? vehicles.find(x => x.id === fd.get('vehicleId'))     : null;
    if (ownerType === 'Person'    && !p) { toast('Select a person', true); return; }
    if (ownerType === 'Household' && !h) { toast('Select a household', true); return; }
    if (ownerType === 'Vehicle'   && !v) { toast('Select a vehicle', true); return; }
    const record = {
      id: existing?.id || uid(),
      title: fd.get('title').trim(), type: fd.get('type'), ownerType,
      personId: p?.id || '', personName: p?.name || '',
      householdId: h?.id || '', householdName: h?.name || '',
      vehicleId: v?.id || '', vehicleName: v ? (v.name || v.registrationNumber) : '',
      documentNumber: fd.get('documentNumber').trim(),
      issueDate: fd.get('issueDate') || '', expiryDate: fd.get('expiryDate') || '',
      notes: fd.get('notes').trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
      modifiedAt: new Date().toISOString()
    };
    const _docRecord = { ...record }; delete _docRecord.fileBlob; delete _docRecord.fileBytes;
    await putOne('documents', _docRecord);
    await logActivity('Document', (existing ? 'Document updated: ' : 'Document added: ') + record.title);
    closeModal(); toast(existing ? 'Document updated' : 'Document added');
    await refreshFamily();
  });
  setTimeout(() => {
    const ot = document.getElementById('ownerTypeSelect');
    const pW = document.getElementById('personSelWrap');
    const hW = document.getElementById('houseSelWrap');
    const vW = document.getElementById('vehicleSelWrap');
    const sync = () => {
      pW.style.display = ot.value === 'Person'    ? '' : 'none';
      hW.style.display = ot.value === 'Household' ? '' : 'none';
      vW.style.display = ot.value === 'Vehicle'   ? '' : 'none';
    };
    ot?.addEventListener('change', sync);
  }, 0);
}

function docDetails(id) {
  const d = _cache.documents.find(x => x.id === id);
  if (!d) return;
  const raw = String(d.documentNumber || '').trim();
  const masked = maskDocNum(raw);
  const owner = d.ownerType === 'Vehicle' ? (d.vehicleName || '—') : (d.personName || d.householdName || '—');
  openModal('Document Details', `<div class="card">
    <div class="title">${esc(d.title)}</div>
    <div class="sub">${esc(d.type || 'Other')}</div>
  </div>
  <div class="detail-grid">
    <div class="detail-row"><small>Owner</small><b>${esc(owner)}</b></div>
    <div class="detail-row"><small>Owner Type</small><b>${esc(d.ownerType || '—')}</b></div>
    <div class="detail-row"><small>Document Number</small>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
        <span id="docNumDisplay" style="font-family:monospace">${esc(masked)}</span>
        ${raw ? '<button type="button" class="btn-icon" id="toggleDocNum">👁️</button>' : ''}
      </div>
    </div>
    <div class="detail-row"><small>Issue Date</small><b>${esc(_cleanDate(d.issueDate) || '—')}</b></div>
    <div class="detail-row"><small>Expiry Date</small><b>${esc(_cleanDate(d.expiryDate) || '—')}</b></div>
    <div class="detail-row"><small>Notes</small><b>${esc(d.notes || '—')}</b></div>
  </div>
  <div class="actions" style="margin-top:12px"><button class="btn" id="docDetailClose">Close</button></div>`);
  if (raw) {
    let visible = false;
    $('toggleDocNum').onclick = () => {
      visible = !visible;
      $('docNumDisplay').textContent = visible ? raw : maskDocNum(raw);
      $('toggleDocNum').textContent = visible ? '🙈' : '👁️';
    };
  }
  $('docDetailClose').onclick = closeModal;
}

$('addDocBtn').onclick = () => docModal();
