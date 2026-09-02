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
    const s = await getOne('meta', 'settings');
    if (s) state.settings = { ...state.settings, ...s };
    applySettings();
    await refreshFamily();
    renderBellReminders();
    updateNotificationStatus();
    // Inject FamilyVault-specific settings section
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
          downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}), 'FamilyVault_Backup_'+today()+'.json');
          await logActivity('Backup','JSON backup exported'); toast('Backup exported');
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
  $('profileLine').textContent = s.name ? s.name + ' · FamilyVault' : 'Documents · People · Offline-first';
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

  // Rewire tile clicks
  document.querySelectorAll('.family-tile').forEach(tile => {
    tile.onclick = () => {
      const type = tile.dataset.tile;
      const panel = $('familySubPanel');
      const wasActive = tile.classList.contains('active');
      document.querySelectorAll('.family-tile').forEach(t => t.classList.remove('active'));
      if (wasActive) { tile.classList.add('active'); panel.style.display = 'block'; showTileContent(type); return; }
      tile.classList.add('active');
      panel.style.display = 'block';
      _activeTile = type;
      showTileContent(type);
    };
  });

  // Restore active tile
  if (_activeTile) {
    const tile = document.querySelector(`.family-tile[data-tile="${_activeTile}"]`);
    if (tile) { tile.classList.add('active'); $('familySubPanel').style.display = 'block'; showTileContent(_activeTile); }
  }
}

function showTileContent(type) {
  const toolbar = $('docToolbar');
  toolbar.style.display = type === 'documents' ? 'flex' : 'none';
  if (type === 'people') renderPeople();
  else if (type === 'households') renderHouseholds();
  else if (type === 'vehicles') renderVehicles();
  else if (type === 'documents') { applyDocFilters(); }
}

/* ===== Helpers ===== */
function formatAge(dob) {
  if (!dob) return 'DOB not set';
  const birth = new Date(dob + 'T00:00:00');
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

/* ===== People ===== */
function renderPeople() {
  const list = $('familyList');
  const { persons } = _cache;
  if (!persons.length) { list.innerHTML = '<div class="empty">No people added yet.</div>'; return; }
  list.innerHTML = persons.map(p => `<div class="member-card">
    <div>
      <div class="title">👤 ${esc(p.name || 'Person')}</div>
      <div class="member-meta">${esc(p.relation || 'Member')} · ${esc(p.householdName || 'No household')}</div>
      <div class="member-meta">${p.dob ? 'DOB: ' + esc(p.dob) : 'DOB: Not set'} · ${esc(p.gender || '')}</div>
      <div class="member-age">${p.dob ? '🎂 ' + formatAge(p.dob) : ''}</div>
      <div class="${p.status === 'Inactive' ? 'status-inactive' : 'status-active'}">${p.status === 'Inactive' ? '⚪ Inactive' : '🟢 Active'}</div>
    </div>
    <div class="actions">
      <button class="btn-icon" data-pedit="${p.id}" title="Edit">✏️</button>
      <button class="btn-icon danger" data-pdel="${p.id}" title="Delete">🗑️</button>
    </div>
  </div>`).join('');
  list.querySelectorAll('[data-pedit]').forEach(b => b.onclick = () => personModal(_cache.persons.find(x => x.id === b.dataset.pedit)));
  list.querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => {
    const p = _cache.persons.find(x => x.id === b.dataset.pdel);
    if (!confirm(`Delete ${p?.name || 'this person'}?`)) return;
    await delOne('persons', b.dataset.pdel);
    await logActivity('Family', 'Person deleted');
    await refreshFamily();
  });
}

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
    <label>Date of Birth<input name="dob" type="date" value="${esc(existing?.dob || '')}"></label>
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
    // Auto-create/update birthday reminder
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
function renderHouseholds() {
  const list = $('familyList');
  const { households } = _cache;
  if (!households.length) { list.innerHTML = '<div class="empty">No households added yet.</div>'; return; }
  list.innerHTML = households.map(h => `<div class="item">
    <div style="min-width:0;flex:1">
      <div class="title">🏠 ${esc(h.name)}</div>
      <div class="sub">${esc(h.description || '')}${h.address ? ' · ' + esc(h.address.split('\n')[0]) : ''}</div>
    </div>
    <div class="actions">
      <button class="btn-icon" data-hedit="${h.id}" title="Edit">✏️</button>
      <button class="btn-icon danger" data-hdel="${h.id}" title="Delete">🗑️</button>
    </div>
  </div>`).join('');
  list.querySelectorAll('[data-hedit]').forEach(b => b.onclick = () => householdModal(_cache.households.find(x => x.id === b.dataset.hedit)));
  list.querySelectorAll('[data-hdel]').forEach(b => b.onclick = async () => {
    const id = b.dataset.hdel;
    const members = _cache.persons.filter(x => x.householdId === id).length;
    const docs = _cache.documents.filter(x => x.householdId === id).length;
    if (members || docs) { toast(`Cannot delete: ${members} member(s) and ${docs} document(s) linked.`, true); return; }
    const h = _cache.households.find(x => x.id === id);
    if (!confirm(`Delete ${h?.name || 'this household'}?`)) return;
    await delOne('households', id);
    await logActivity('Family', 'Household deleted');
    await refreshFamily();
  });
}

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
function renderVehicles() {
  const list = $('familyList');
  const { vehicles } = _cache;
  if (!vehicles.length) { list.innerHTML = '<div class="empty">No vehicles added yet.</div>'; return; }
  list.innerHTML = vehicles.map(v => `<div class="item">
    <div style="min-width:0;flex:1">
      <div class="title">🚗 ${esc(v.name || v.registrationNumber || 'Vehicle')}</div>
      <div class="sub">${esc(v.type || 'Vehicle')} · ${esc(v.make || '')} ${esc(v.model || '')} · Reg: ${esc(v.registrationNumber || 'Not set')}</div>
      <div class="sub">Owner: ${esc(v.ownerPersonName || 'Not assigned')}</div>
    </div>
    <div class="actions">
      <button class="btn-icon" data-vedit="${v.id}" title="Edit">✏️</button>
      <button class="btn-icon danger" data-vdel="${v.id}" title="Delete">🗑️</button>
    </div>
  </div>`).join('');
  list.querySelectorAll('[data-vedit]').forEach(b => b.onclick = () => vehicleModal(_cache.vehicles.find(x => x.id === b.dataset.vedit)));
  list.querySelectorAll('[data-vdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this vehicle?')) return;
    await delOne('vehicles', b.dataset.vdel);
    await logActivity('Family', 'Vehicle deleted');
    await refreshFamily();
  });
}

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
function applyDocFilters() {
  const q = ($('docSearch')?.value || '').toLowerCase();
  const typeF = $('docTypeFilter')?.value || '';
  const filtered = _cache.documents.filter(d => {
    const matchQ = !q || [d.title, d.type, d.category, d.personName, d.householdName].some(x => String(x || '').toLowerCase().includes(q));
    const matchT = !typeF || d.type === typeF;
    return matchQ && matchT;
  });
  renderDocTable(filtered);
}

$('docSearch').oninput = () => { getPage('docs').page = 1; applyDocFilters(); };
$('docTypeFilter').onchange = () => { getPage('docs').page = 1; applyDocFilters(); };

function renderDocTable(docs) {
  const host = $('familyList');
  if (!docs.length) { host.innerHTML = '<div class="empty">No documents found.</div>'; return; }
  _pgRender['docs'] = () => renderDocTable(docs);
  const { pageRows, totalPages, page, total } = paginate('docs', docs);
  const st = getPage('docs');
  const rows = pageRows.map(d => {
    const warn = d.expiryDate && calcExpiry(d.expiryDate) ? ' ⚠️' : '';
    return `<tr>
      <td>${esc(d.title)}${warn}</td>
      <td>${esc(d.type || '—')}</td>
      <td>${esc(d.personName || d.householdName || '—')}</td>
      <td>${esc(d.expiryDate || '—')}</td>
      <td><div class="table-actions">
        <button class="btn-icon" data-dview="${d.id}" title="Details">👁️</button>
        <button class="btn-icon" data-dedit="${d.id}" title="Edit">✏️</button>
        <button class="btn-icon danger" data-ddel="${d.id}" title="Delete">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
  host.innerHTML = `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Title</th><th>Type</th><th>Owner</th><th>Expiry</th><th>Actions</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>` + paginationHtml('docs', page, totalPages, total, st.pageSize);
  host.querySelectorAll('[data-dview]').forEach(b => b.onclick = () => docDetails(b.dataset.dview));
  host.querySelectorAll('[data-dedit]').forEach(b => b.onclick = () => docModal(_cache.documents.find(x => x.id === b.dataset.dedit)));
  host.querySelectorAll('[data-ddel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this document?')) return;
    await delOne('documents', b.dataset.ddel);
    await logActivity('Document', 'Document deleted');
    await refreshFamily(); applyDocFilters();
  });
}

function docModal(existing = null) {
  const { persons, households } = _cache;
  const pOpts = persons.map(p => `<option value="${p.id}" ${existing?.personId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const hOpts = households.map(h => `<option value="${h.id}" ${existing?.householdId === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('');
  const typeOpts = ['Aadhaar','PAN','Passport','Driving Licence','Ration Card','Insurance','Education','Employment','Property','Vehicle','Certificate','Other'].map(t => `<option ${existing?.type === t ? 'selected' : ''}>${t}</option>`).join('');
  openModal(existing ? 'Edit Document' : 'Add Document', `<form class="grid">
    <label>Document Name <span class="req-star">*</span><input name="title" required value="${esc(existing?.title || '')}"></label>
    <label>Type <span class="req-star">*</span><select name="type" required><option value="">Select type</option>${typeOpts}</select></label>
    <label>Owner Type <span class="req-star">*</span>
      <select name="ownerType" id="ownerTypeSelect" required>
        <option value="">Select</option>
        <option ${existing?.ownerType === 'Person' ? 'selected' : ''}>Person</option>
        <option ${existing?.ownerType === 'Household' ? 'selected' : ''}>Household</option>
      </select>
    </label>
    <label id="personSelWrap">Person<select name="personId"><option value="">Select person</option>${pOpts}</select></label>
    <label id="houseSelWrap" style="display:none">Household<select name="householdId"><option value="">Select household</option>${hOpts}</select></label>
    <label>Document Number <span class="req-star">*</span><input name="documentNumber" required value="${esc(existing?.documentNumber || '')}"></label>
    <label>Issue Date<input name="issueDate" type="date" value="${esc(existing?.issueDate || '')}"></label>
    <label>Expiry Date<input name="expiryDate" type="date" value="${esc(existing?.expiryDate || '')}"></label>
    <label style="grid-column:1/-1">Notes<textarea name="notes">${esc(existing?.notes || '')}</textarea></label>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save Document</button></div>
  </form>`, async fd => {
    const ownerType = fd.get('ownerType');
    const p = ownerType === 'Person' ? persons.find(x => x.id === fd.get('personId')) : null;
    const h = ownerType === 'Household' ? households.find(x => x.id === fd.get('householdId')) : null;
    if (ownerType === 'Person' && !p) { toast('Select a person', true); return; }
    if (ownerType === 'Household' && !h) { toast('Select a household', true); return; }
    const record = {
      id: existing?.id || uid(),
      title: fd.get('title').trim(), type: fd.get('type'), ownerType,
      personId: p?.id || '', personName: p?.name || '',
      householdId: h?.id || '', householdName: h?.name || '',
      documentNumber: fd.get('documentNumber').trim(),
      issueDate: fd.get('issueDate') || '', expiryDate: fd.get('expiryDate') || '',
      notes: fd.get('notes').trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
      modifiedAt: new Date().toISOString()
    };
    await putOne('documents', record);
    await logActivity('Document', (existing ? 'Document updated: ' : 'Document added: ') + record.title);
    closeModal(); toast(existing ? 'Document updated' : 'Document added');
    await refreshFamily(); applyDocFilters();
  });
  setTimeout(() => {
    const ot = document.getElementById('ownerTypeSelect');
    const pW = document.getElementById('personSelWrap');
    const hW = document.getElementById('houseSelWrap');
    const sync = () => { const isPerson = ot.value === 'Person'; pW.style.display = isPerson ? 'block' : 'none'; hW.style.display = isPerson ? 'none' : 'block'; };
    ot?.addEventListener('change', sync); sync();
  }, 0);
}

function docDetails(id) {
  const d = _cache.documents.find(x => x.id === id);
  if (!d) return;
  const raw = String(d.documentNumber || '').trim();
  const masked = maskDocNum(raw);
  openModal('Document Details', `<div class="card">
    <div class="title">${esc(d.title)}</div>
    <div class="sub">${esc(d.type || 'Other')}</div>
  </div>
  <div class="detail-grid">
    <div class="detail-row"><small>Owner</small><b>${esc(d.personName || d.householdName || '—')}</b></div>
    <div class="detail-row"><small>Owner Type</small><b>${esc(d.ownerType || '—')}</b></div>
    <div class="detail-row"><small>Document Number</small>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
        <span id="docNumDisplay" style="font-family:monospace">${esc(masked)}</span>
        ${raw ? '<button type="button" class="btn-icon" id="toggleDocNum">👁️</button>' : ''}
      </div>
    </div>
    <div class="detail-row"><small>Issue Date</small><b>${esc(d.issueDate || '—')}</b></div>
    <div class="detail-row"><small>Expiry Date</small><b>${esc(d.expiryDate || '—')}</b></div>
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


