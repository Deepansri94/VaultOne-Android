'use strict';
/* ===== iVault — own IndexedDB ===== */
const IV_DB = 'iVaultDB';
const IV_VER = 1;
const IV_STORES = ['meta','income','expenses','budgets','investments','loans','reminders','activity','notes'];

const BUDGET_CATS = ['Household','Transport','Food & Personal','Health & Emergency','Loans & Financial','Family / Religious / Social','Savings & Investments','Other'];
const BUDGET_SUBCATS = {
  'Household':['Rent','Electricity','Water / Maintenance','Internet / Cable','Gas / LPG'],
  'Transport':['Fuel / Petrol','Auto / Cab / Bus','Vehicle EMI','Parking / Toll'],
  'Food & Personal':['Groceries','Vegetables & Fruits','Milk & Dairy','Eating Out / Sweets','Personal Care'],
  'Health & Emergency':['Medicine / Pharmacy','Doctor / Hospital','Emergency Fund'],
  'Loans & Financial':['Home Loan EMI','Car / Bike Loan','Personal Loan','Credit Card'],
  'Family / Religious / Social':['Festivals / Pooja','Gifts / Events','Donations','School / Tuition'],
  'Savings & Investments':['SIP / Mutual Fund','PPF / RD','Insurance Premium','FD'],
  'Other':['Miscellaneous','Subscriptions','Clothing','Home Maintenance']
};

let state = { settings: { id:'settings', name:'', currency:'INR' } };
let _currentSV = 'overview';
let _budgetMonth = new Date().toISOString().slice(0,7);

let _budgetLocked = false;

/* ===== Boot ===== */
(async () => {
  try {
    await openDB(IV_DB, IV_VER, IV_STORES);
    const s = await getOne('meta','settings');
    if (s) {
      state.settings = { ...state.settings, ...s };
      state.customSubcats = s.customSubcats || {};
    }
    applySettings();
    wireNav();
    await renderOverview();
    renderBellReminders();
    updateNotificationStatus();
    // Inject iVault-specific settings section
    appendSettingsPanelSection(`
      <hr style="border-color:#ffffff12;margin:16px 0">
      <h4 style="margin:0 0 12px;font-size:14px;color:#94a3b8">💾 Backup &amp; Restore</h4>
      <div class="actions" style="margin-top:0">
        <button class="btn primary" id="spIvExportBtn">⬇️ Export JSON</button>
        <button class="btn" id="spIvImportBtn">⬆️ Import JSON</button>
      </div>
      <hr style="border-color:#ffffff12;margin:16px 0">
      <div class="dangerbox" style="margin-top:0">
        <p class="muted" style="margin:0 0 10px;font-size:13px">Permanently deletes all iVault data on this device.</p>
        <button class="btn danger" id="spIvClearBtn">🗑️ Clear All iVault Data</button>
      </div>`);
    setTimeout(() => {
      document.getElementById('spIvExportBtn')?.addEventListener('click', async () => {
        try {
          const data = await exportJSON('iVault', IV_STORES);
          downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}), 'iVault_Backup_'+today()+'.json');
          await logActivity('Backup','JSON backup exported'); toast('Backup exported');
        } catch(e) { toast('Export failed: '+e.message, true); }
      });
      document.getElementById('spIvImportBtn')?.addEventListener('click', () => {
        $('importFile').value = '';
        $('importFile').onchange = async () => {
          try {
            const f = $('importFile').files?.[0]; if(!f) return;
            const data = JSON.parse(await f.text());
            if (await importJSON(data,'iVault',IV_STORES)) {
              const s = await getOne('meta','settings');
              if(s) state.settings={...state.settings,...s};
              applySettings(); await renderOverview(); renderBellReminders(); toast('Import completed');
            }
          } catch(e) { toast('Import failed: '+e.message, true); }
        };
        $('importFile').click();
      });
      document.getElementById('spIvClearBtn')?.addEventListener('click', () => {
        openModal('Clear All iVault Data', `<div class="dangerbox"><p><b>This permanently deletes all iVault data on this device.</b></p></div>
          <form id="clearForm"><label>Type DELETE to confirm<input name="confirm" required placeholder="Type DELETE" autocomplete="off"></label>
          <div class="actions"><button class="btn danger">Confirm &amp; Clear</button><button type="button" class="btn" id="cancelClear">Cancel</button></div></form>`,
          async fd => {
            if (String(fd.get('confirm')||'').trim().toUpperCase() !== 'DELETE') { toast('Type DELETE exactly', true); return; }
            for (const s of IV_STORES) await clearStore(s);
            state.settings = { id:'settings', name:'', currency:'INR' };
            await putOne('meta', state.settings);
            closeModal(); toast('All iVault data cleared');
            applySettings(); await renderOverview();
          });
        setTimeout(() => { $('cancelClear')?.addEventListener('click', closeModal); }, 0);
      });
    }, 100);
  } catch(e) {
    document.body.innerHTML = `<div style="padding:30px;color:white"><h2>iVault could not load</h2><p>${esc(e.message)}</p><button onclick="location.reload()">Retry</button></div>`;
  }
})();

function applySettings() {
  const s = state.settings;
  $('profileLine').textContent = s.name ? s.name + ' · iVault' : 'Personal Finance · Offline-first';
  if ($('profileName')) $('profileName').value = s.name || '';
  if ($('profileCurrency')) $('profileCurrency').value = s.currency || 'INR';
}

/* ===== Nav ===== */
function wireNav() {
  document.querySelectorAll('[data-sv]').forEach(btn => {
    btn.onclick = () => switchSV(btn.dataset.sv);
  });
}

async function switchSV(id) {
  _currentSV = id;
  document.querySelectorAll('.sub-view').forEach(v => v.classList.toggle('active', v.id === 'sv-' + id));
  document.querySelectorAll('[data-sv]').forEach(b => b.classList.toggle('active', b.dataset.sv === id));
  if (id === 'overview') await renderOverview();
  else if (id === 'income') { await renderIncome(); }
  else if (id === 'expenses') { await renderExpenses(); const catSel = document.querySelector('#expenseForm [name="category"]'); if (catSel) await populateExpLinked(catSel.value); }
  else if (id === 'budget') await renderBudget();
  else if (id === 'investments') await renderInvestments();
  else if (id === 'loans') await renderLoans();
}

/* ===== Overview ===== */
async function renderOverview() {
  const [inc, exp, bud, inv, loans, acts] = await Promise.all([
    getAll('income'), getAll('expenses'), getAll('budgets'),
    getAll('investments'), getAll('loans'), getAll('activity')
  ]);
  const month = new Date().toISOString().slice(0,7);
  const N = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

  const mInc = inc.filter(x => (x.date||'').startsWith(month)).reduce((a,b) => a + N(b.amount), 0);
  const mExp = exp.filter(x => (x.date||'').startsWith(month)).reduce((a,b) => a + N(b.amount), 0);

  // Net worth = investments + (total income - total expenses) - loan liabilities
  const invAssets = inv.reduce((s,x) => s + N(x.currentValue), 0);
  const totalInc = inc.reduce((s,x) => s + N(x.amount), 0);
  const totalExp = exp.reduce((s,x) => s + N(x.amount), 0);
  const cashSavings = Math.max(0, totalInc - totalExp);
  const loanLiab = loans.filter(x => x.status !== 'Settled').reduce((s,x) => s + N(x.outstanding), 0);
  const netWorth = invAssets + cashSavings - loanLiab;

  $('statNetWorth').textContent = money(netWorth, state.settings.currency);
  $('statIncome').textContent = money(mInc, state.settings.currency);
  $('statExpense').textContent = money(mExp, state.settings.currency);
  $('statSavings').textContent = money(Math.max(0, mInc - mExp), state.settings.currency);

  // Budget bar
  const budRec = bud.find(b => b.month === month);
  const bt = budRec ? Object.values(budRec.categories || {}).reduce((a,b) => a + N(b), 0) : 0;
  $('budgetTotal').textContent = money(bt, state.settings.currency);
  $('budgetBar').style.width = bt ? Math.min(100, mExp / bt * 100) + '%' : '0%';
  $('budgetInfo').textContent = bt
    ? money(mExp, state.settings.currency) + ' spent · ' + money(Math.max(0, bt - mExp), state.settings.currency) + ' remaining'
    : 'No budget configured for this month.';

  // Recent activity
  const recent = acts.slice().sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,6);
  $('recentActivity').innerHTML = recent.length
    ? recent.map(a => `<div class="item"><div><div class="title">${esc(a.text)}</div><div class="sub">${new Date(a.createdAt).toLocaleString()}</div></div><span class="pill">${esc(a.type)}</span></div>`).join('')
    : '<div class="empty">No activity yet.</div>';
}

/* ===== Income ===== */
async function renderIncome() {
  const rows = await getAll('income');
  const sorted = rows.slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
  _pgRender['income'] = renderIncome;
  const { pageRows, totalPages, page, total } = paginate('income', sorted);
  const st = getPage('income');
  const body = pageRows.map(x => `<tr>
    <td>${esc(x.date||'')}</td>
    <td>${esc(x.type||'Income')}</td>
    <td><b>${money(x.amount, state.settings.currency)}</b></td>
    <td>${esc(x.note||'')}</td>
    <td><div class="table-actions">
      <button class="btn-icon" data-iedit="${x.id}" title="Edit">✏️</button>
      <button class="btn-icon danger" data-idel="${x.id}" title="Delete">🗑️</button>
    </div></td>
  </tr>`).join('');
  $('incomeList').innerHTML = total
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Note</th><th>Actions</th></tr></thead><tbody>${body}</tbody></table></div>` + paginationHtml('income', page, totalPages, total, st.pageSize)
    : '<div class="empty">No income records yet.</div>';
  $('incomeList').querySelectorAll('[data-iedit]').forEach(b => b.onclick = () => incomeEditModal(b.dataset.iedit));
  $('incomeList').querySelectorAll('[data-idel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this income record?')) return;
    await delOne('income', b.dataset.idel);
    await logActivity('Income','Income deleted');
    await renderIncome(); await renderOverview();
  });
}

/* ===== Expenses ===== */
async function renderExpenses() {
  const rows = await getAll('expenses');
  const sorted = rows.slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
  _pgRender['expenses'] = renderExpenses;
  const { pageRows, totalPages, page, total } = paginate('expenses', sorted);
  const st = getPage('expenses');
  const body = pageRows.map(x => `<tr>
    <td>${esc(x.date||'')}</td>
    <td>${esc(x.category||'')}</td>
    <td>${esc(x.subcategory||'')}</td>
    <td><b>${money(x.amount, state.settings.currency)}</b></td>
    <td>${esc(x.note||'')}</td>
    <td><div class="table-actions">
      <button class="btn-icon" data-exedit="${x.id}" title="Edit">✏️</button>
      <button class="btn-icon danger" data-exdel="${x.id}" title="Delete">🗑️</button>
    </div></td>
  </tr>`).join('');
  $('expenseList').innerHTML = total
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Category</th><th>Sub-cat</th><th>Amount</th><th>Note</th><th>Actions</th></tr></thead><tbody>${body}</tbody></table></div>` + paginationHtml('expenses', page, totalPages, total, st.pageSize)
    : '<div class="empty">No expense records yet.</div>';
  $('expenseList').querySelectorAll('[data-exedit]').forEach(b => b.onclick = () => expenseEditModal(b.dataset.exedit));
  $('expenseList').querySelectorAll('[data-exdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this expense?')) return;
    await delOne('expenses', b.dataset.exdel);
    await logActivity('Expense','Expense deleted');
    await renderExpenses(); await renderOverview();
  });
}

/* ===== Expense form — dynamic sub-category ===== */
const INV_LINKABLE = ['RD','PPF','SSA','NPS','Other Saving']; // Demat excluded

// Returns current sub-cats for a category (merges defaults + any user-added ones stored in meta)
function getSubcats(category) {
  const custom = state.customSubcats || {};
  const renames = (custom._renames || {})[category] || {};
  const base = (BUDGET_SUBCATS[category] || []).map(s => renames[s] || s);
  const extra = (custom[category] || []).filter(s => !base.includes(s));
  return [...base, ...extra];
}

async function populateExpLinked(category) {
  const linkedLabel = $('expLinkedLabel');
  const linkedSel = $('expLinkedSelect');
  const subcatLabel = $('expSubcatLabel');
  const subcatSel = $('expSubcatSelect');
  if (!linkedLabel || !linkedSel || !subcatSel) return;

  if (category === 'Loans & Financial') {
    const loans = (await getAll('loans')).filter(x => x.status !== 'Settled');
    linkedSel.innerHTML = '<option value="">— select loan —</option>' +
      loans.map(l => `<option value="${l.id}">${esc(l.name || l.loanType)} · Outstanding: ${money(l.outstanding, state.settings.currency)}</option>`).join('');
    linkedLabel.style.display = '';
    subcatLabel.style.display = 'none';
  } else if (category === 'Savings & Investments') {
    const invs = (await getAll('investments')).filter(x => INV_LINKABLE.includes(x.type));
    linkedSel.innerHTML = '<option value="">— select investment —</option>' +
      invs.map(x => `<option value="${x.id}">${esc(x.name || x.type)} (${esc(x.type)}) · ${money(x.currentValue, state.settings.currency)}</option>`).join('');
    linkedLabel.style.display = '';
    subcatLabel.style.display = 'none';
  } else {
    linkedLabel.style.display = 'none';
    subcatLabel.style.display = '';
    const subs = getSubcats(category);
    subcatSel.innerHTML = '<option value="">-- select --</option>' +
      subs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Wire category change on expense form
  const catSel = document.querySelector('#expenseForm [name="category"]');
  catSel?.addEventListener('change', () => populateExpLinked(catSel.value));

  $('budgetEditBtn')?.addEventListener('click', () => {
    _budgetLocked = false;
    $('budgetEditBtn').style.display = 'none';
    renderBudget();
  });

  $('incomeForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get('amount'));
    if (amount <= 0) { toast('Enter a valid amount', true); return; }
    await putOne('income', { id: uid(), type: fd.get('type'), amount, date: fd.get('date') || today(), note: fd.get('note') || '', createdAt: new Date().toISOString() });
    await logActivity('Income','Income saved');
    toast('Income saved'); e.currentTarget.reset();
    await renderIncome(); await renderOverview();
  });

  $('expenseForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get('amount'));
    if (amount <= 0) { toast('Enter a valid amount', true); return; }
    const category = fd.get('category') || '';
    const linkedId = fd.get('linkedId') || '';
    const date = fd.get('date') || today();
    let subcategory = fd.get('subcategory') || '';
    let paidMsg = '';
    if (category === 'Loans & Financial' && linkedId) {
      const loan = await getOne('loans', linkedId);
      if (loan) {
        subcategory = loan.name || loan.loanType;
        await reduceLoanOutstanding(loan, amount, date);
        paidMsg = `Paid ${money(amount, state.settings.currency)} toward "${subcategory}" on ${date}`;
      }
    } else if (category === 'Savings & Investments' && linkedId) {
      const inv = await getOne('investments', linkedId);
      if (inv) {
        subcategory = inv.name || inv.type;
        inv.currentValue = (Number(inv.currentValue) || 0) + amount;
        await putOne('investments', inv);
        await logActivity('Investment', `Top-up: ${money(amount, state.settings.currency)} added to ${inv.name}`);
        paidMsg = `Added ${money(amount, state.settings.currency)} to "${subcategory}" on ${date}`;
      }
    }

    await putOne('expenses', { id: uid(), category, subcategory, amount, date, note: fd.get('note') || '', createdAt: new Date().toISOString() });
    await logActivity('Expense', 'Expense saved');

    if (paidMsg) {
      const info = $('expPaidInfo');
      if (info) { info.textContent = '✅ ' + paidMsg; info.style.display = ''; }
      toast(paidMsg);
    } else {
      toast('Expense saved');
    }

    e.currentTarget.reset();
    $('expSubcatLabel').style.display = '';
    $('expLinkedLabel').style.display = 'none';
    await populateExpLinked('Household'); // reset subcats to default category
    await renderExpenses(); await renderOverview();
  });
});

async function reduceLoanOutstanding(loan, emiAmount, date) {
  const N = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const monthlyRate = N(loan.interestRate) / 12 / 100;
  const interest = monthlyRate > 0 ? Math.round(N(loan.outstanding) * monthlyRate) : 0;
  const principal = Math.max(0, Math.round(emiAmount) - interest);
  const newOutstanding = Math.max(0, Math.round(N(loan.outstanding)) - principal);
  loan.outstanding = newOutstanding;
  if (newOutstanding === 0) loan.status = 'Settled';
  if (loan.dueDate) {
    const d = new Date(loan.dueDate + 'T00:00:00');
    d.setMonth(d.getMonth() + 1);
    const pad = n => String(n).padStart(2,'0');
    loan.dueDate = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    if (loan.status !== 'Settled') {
      await putOne('reminders', {
        id: 'loan-due-' + loan.id,
        title: 'Loan EMI Due: ' + (loan.name || loan.loanType),
        date: loan.dueDate, time: '09:00', priority: 'High',
        description: 'Outstanding: ' + money(newOutstanding, state.settings.currency),
        completed: false, source: 'loan', loanId: loan.id,
        createdAt: new Date().toISOString()
      });
    } else {
      await delOne('reminders', 'loan-due-' + loan.id).catch(() => {});
    }
  }
  // Store payment history on the loan record
  if (!loan.payments) loan.payments = [];
  loan.payments.push({ date, emi: Math.round(emiAmount), principal, interest, outstanding: newOutstanding });
  await putOne('loans', loan);
  await logActivity('Loan', `EMI paid: ${money(emiAmount, state.settings.currency)} · Principal: ${money(principal, state.settings.currency)} · Interest: ${money(interest, state.settings.currency)} · New outstanding: ${money(newOutstanding, state.settings.currency)}`);
  toast(`Loan updated — Outstanding: ${money(newOutstanding, state.settings.currency)}`);
  renderBellReminders();
}

async function expenseEditModal(id) {
  const row = await getOne('expenses', id); if (!row) return;
  const catOpts = BUDGET_CATS.map(c => `<option ${row.category===c?'selected':''}>${esc(c)}</option>`).join('');
  openModal('Edit Expense', `<form class="grid">
    <label>Category<select name="category">${catOpts}</select></label>
    <label>Sub-category<input name="subcategory" value="${esc(row.subcategory||'')}"></label>
    <label>Amount<input name="amount" type="number" min="0" step="0.01" required value="${Number(row.amount)}"></label>
    <label>Date<input name="date" type="date" required value="${esc(row.date||'')}"></label>
    <label>Note<input name="note" value="${esc(row.note||'')}"></label>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save Changes</button></div>
  </form>`, async fd => {
    row.category = fd.get('category'); row.subcategory = fd.get('subcategory') || '';
    row.amount = Number(fd.get('amount')); row.date = fd.get('date') || today(); row.note = fd.get('note') || '';
    await putOne('expenses', row);
    await logActivity('Expense','Expense updated');
    closeModal(); toast('Expense updated');
    await renderExpenses(); await renderOverview();
  });
}

/* ===== Budget ===== */
async function renderBudget() {
  const month = _budgetMonth;
  const [y, m] = month.split('-');
  $('budgetMonthLabel').textContent = new Date(+y, +m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  $('budgetMonthInput').value = month;

  const bud = await getAll('budgets');
  const rec = bud.find(b => b.month === month);
  const cats = rec?.categories || {};

  $('budgetCategoryFields').innerHTML = BUDGET_CATS.map(c => {
    const safeId = c.replace(/[^a-z0-9]/gi, '_');
    const subs = getSubcats(c);
    const subRows = subs.map(s => {
      const safeSub = (c + '_' + s).replace(/[^a-z0-9]/gi, '_');
      return `<div style="display:grid;grid-template-columns:1fr auto 120px;gap:6px;align-items:center;margin-bottom:4px;padding-left:16px">
        <span class="budget-sublabel" data-cat="${esc(c)}" data-sub="${esc(s)}" style="font-size:12px;color:#94a3b8;cursor:pointer" title="Click to rename">${esc(s)}</span>
        <button type="button" class="btn-icon" data-rensub data-cat="${esc(c)}" data-sub="${esc(s)}" title="Rename">✏️</button>
        <input name="sub_${safeSub}" type="number" min="0" step="1" value="${Number(cats[c + '.' + s] || 0)}" style="margin-top:0;font-size:12px;padding:5px 8px">
      </div>`;
    }).join('');
    return `<div style="margin-bottom:12px;border:1px solid #ffffff10;border-radius:10px;padding:10px">
      <div style="display:grid;grid-template-columns:1fr 120px;gap:8px;align-items:center;margin-bottom:${subs.length ? '8px' : '0'}">
        <label style="margin:0;font-size:13px;font-weight:700">${esc(c)}</label>
        <input name="cat_${safeId}" type="number" min="0" step="1" value="${Number(cats[c] || 0)}" style="margin-top:0">
      </div>
      ${subRows}
      <button type="button" class="btn" data-addsubcat="${esc(c)}" style="margin-top:6px;font-size:12px;padding:4px 10px">+ Add Sub-category</button>
    </div>`;
  }).join('');

  // Wire rename sub-category buttons
  $('budgetCategoryFields').querySelectorAll('[data-rensub]').forEach(btn => {
    btn.onclick = () => renameSubcat(btn.dataset.cat, btn.dataset.sub);
  });
  // Wire add sub-category buttons
  $('budgetCategoryFields').querySelectorAll('[data-addsubcat]').forEach(btn => {
    btn.onclick = () => addSubcat(btn.dataset.addsubcat);
  });

  // Apply lock state AFTER rendering inputs
  const budgetEditBtn = $('budgetEditBtn');
  if (_budgetLocked) {
    $('budgetForm').querySelectorAll('input[type="number"]').forEach(el => el.disabled = true);
    $('budgetForm').querySelector('button[type="submit"]').disabled = true;
    $('budgetCategoryFields').querySelectorAll('button').forEach(el => el.disabled = true);
    if (budgetEditBtn) budgetEditBtn.style.display = 'inline-flex';
  } else {
    if (budgetEditBtn) budgetEditBtn.style.display = 'none';
  }

  // Actuals
  const exp = await getAll('expenses');
  const mExp = exp.filter(x => (x.date || '').startsWith(month));
  const actuals = {};
  BUDGET_CATS.forEach(c => { actuals[c] = mExp.filter(x => x.category === c).reduce((a, b) => a + Number(b.amount || 0), 0); });
  const bt = Object.values(cats).filter((_, i, a) => !String(Object.keys(cats)[i]).includes('.')).reduce((a, b) => a + Number(b || 0), 0);

  if (bt > 0 || mExp.length) {
    $('budgetActualsCard').style.display = 'block';
    const rows = BUDGET_CATS.map(c => {
      const budgeted = Number(cats[c] || 0);
      const actual = actuals[c] || 0;
      const diff = budgeted - actual;
      const cls = diff >= 0 ? 'good' : 'bad';
      return `<tr><td>${esc(c)}</td><td>${money(budgeted, state.settings.currency)}</td><td>${money(actual, state.settings.currency)}</td><td class="${cls}">${money(diff, state.settings.currency)}</td></tr>`;
    }).join('');
    $('budgetActuals').innerHTML = `<div class="table-wrap"><table class="comparison">
      <thead><tr><th>Category</th><th>Budgeted</th><th>Actual</th><th>Remaining</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  } else {
    $('budgetActualsCard').style.display = 'none';
  }
}

function addSubcat(category) {
  openModal('Add Sub-category', `<form class="grid">
    <label>Category<input value="${esc(category)}" disabled style="opacity:.6"></label>
    <label>Sub-category Name <span class="req-star">*</span><input name="subname" required placeholder="e.g. Water Bill"></label>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Add</button></div>
  </form>`, async fd => {
    const name = String(fd.get('subname') || '').trim();
    if (!name) { toast('Enter a name', true); return; }
    if (!state.customSubcats) state.customSubcats = {};
    if (!state.customSubcats[category]) state.customSubcats[category] = [];
    if (!state.customSubcats[category].includes(name)) state.customSubcats[category].push(name);
    await putOne('meta', { ...state.settings, id: 'settings', customSubcats: state.customSubcats });
    closeModal(); toast('Sub-category added');
    await renderBudget();
    // also refresh expense sub-cat dropdown if on expenses tab
    const cat = document.querySelector('#expenseForm [name="category"]');
    if (cat) populateExpLinked(cat.value);
  });
}

function renameSubcat(category, oldName) {
  openModal('Rename Sub-category', `<form class="grid">
    <label>Current Name<input value="${esc(oldName)}" disabled style="opacity:.6"></label>
    <label>New Name <span class="req-star">*</span><input name="newname" required value="${esc(oldName)}"></label>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Rename</button></div>
  </form>`, async fd => {
    const newName = String(fd.get('newname') || '').trim();
    if (!newName || newName === oldName) { closeModal(); return; }
    if (!state.customSubcats) state.customSubcats = {};
    // For default sub-cats: move to custom with new name (remove old from defaults by adding override)
    if (!state.customSubcats[category]) state.customSubcats[category] = [];
    const idx = state.customSubcats[category].indexOf(oldName);
    if (idx >= 0) state.customSubcats[category][idx] = newName;
    else {
      // It's a default — store rename mapping
      if (!state.customSubcats._renames) state.customSubcats._renames = {};
      if (!state.customSubcats._renames[category]) state.customSubcats._renames[category] = {};
      state.customSubcats._renames[category][oldName] = newName;
    }
    await putOne('meta', { ...state.settings, id: 'settings', customSubcats: state.customSubcats });
    closeModal(); toast('Sub-category renamed');
    await renderBudget();
    const cat = document.querySelector('#expenseForm [name="category"]');
    if (cat) populateExpLinked(cat.value);
  });
}

$('budgetForm').onsubmit = async e => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const month = fd.get('month');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) { toast('Invalid month', true); return; }
  const categories = {};
  BUDGET_CATS.forEach(c => {
    categories[c] = Math.max(0, Number(fd.get('cat_' + c.replace(/[^a-z0-9]/gi, '_')) || 0));
    getSubcats(c).forEach(s => {
      const key = (c + '_' + s).replace(/[^a-z0-9]/gi, '_');
      const val = Math.max(0, Number(fd.get('sub_' + key) || 0));
      if (val > 0) categories[c + '.' + s] = val;
    });
  });
  const bud = await getAll('budgets');
  const existing = bud.find(b => b.month === month);
  await putOne('budgets', { id: existing?.id || uid(), month, categories, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
  await logActivity('Budget', 'Budget saved for ' + month);
  toast('Budget saved');
  _budgetLocked = true;
  await renderBudget(); await renderOverview();
};

$('budgetPrev').onclick = () => {
  const d = new Date(_budgetMonth + '-01');
  d.setMonth(d.getMonth() - 1);
  _budgetMonth = d.toISOString().slice(0, 7);
  _budgetLocked = false;
  renderBudget();
};
$('budgetNext').onclick = () => {
  const d = new Date(_budgetMonth + '-01');
  d.setMonth(d.getMonth() + 1);
  _budgetMonth = d.toISOString().slice(0, 7);
  _budgetLocked = false;
  renderBudget();
};

/* ===== Investments (balance trackers only) ===== */
const INV_TYPES = ['FD','RD','PPF','SSA','NPS','Demat','Gold','Other Saving'];

async function renderInvestments() {
  const rows = await getAll('investments');
  const N = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  if (!rows.length) { $('invList').innerHTML = '<div class="empty">No investments added yet.</div>'; return; }
  const grouped = {};
  INV_TYPES.forEach(t => { grouped[t] = rows.filter(x => x.type === t); });
  let html = '';
  INV_TYPES.forEach(t => {
    if (!grouped[t].length) return;
    html += `<div class="inv-section-head">${esc(t)}</div>`;
    html += grouped[t].map(x => `<div class="item">
      <div style="min-width:0;flex:1">
        <div class="title">${esc(x.name || x.type)}</div>
        <div class="sub">${esc(x.provider || x.bankName || '')}${x.accountNumber ? ' · A/C: ' + esc(x.accountNumber) : ''}</div>
        <div class="sub">Current Value: <b>${money(x.currentValue, state.settings.currency)}</b></div>
      </div>
      <div class="actions">
        <button class="btn-icon" data-invedit="${x.id}" title="Edit">✏️</button>
        <button class="btn-icon danger" data-invdel="${x.id}" title="Delete">🗑️</button>
      </div>
    </div>`).join('');
  });
  $('invList').innerHTML = html;
  $('invList').querySelectorAll('[data-invedit]').forEach(b => b.onclick = async () => {
    const x = await getOne('investments', b.dataset.invedit); if (x) invModal(x);
  });
  $('invList').querySelectorAll('[data-invdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this investment?')) return;
    await delOne('investments', b.dataset.invdel);
    await logActivity('Investment', 'Investment deleted');
    await renderInvestments(); await renderOverview();
  });
}

$('addInvBtn').onclick = () => invModal();

function invModal(existing = null) {
  const typeOpts = INV_TYPES.map(t => `<option ${existing?.type === t ? 'selected' : ''}>${t}</option>`).join('');
  openModal(existing ? 'Edit Investment' : 'Add Investment', `<form class="grid">
    <label>Type <span class="req-star">*</span><select name="type" required>${typeOpts}</select></label>
    <label>Name <span class="req-star">*</span><input name="name" required value="${esc(existing?.name || '')}"></label>
    <label>Provider / Bank<input name="provider" value="${esc(existing?.provider || existing?.bankName || '')}"></label>
    <label>Account Number<input name="accountNumber" value="${esc(existing?.accountNumber || '')}"></label>
    <label>Current Value <span class="req-star">*</span><input name="currentValue" type="number" min="0" step="0.01" required value="${Number(existing?.currentValue || 0)}"></label>
    <label>Interest Rate (%)<input name="interestRate" type="number" min="0" step="0.01" value="${Number(existing?.interestRate || 0)}"></label>
    <label>Start Date<input name="startDate" type="date" value="${esc(existing?.startDate || '')}"></label>
    <label>Maturity Date<input name="maturityDate" type="date" value="${esc(existing?.maturityDate || '')}"></label>
    <label style="grid-column:1/-1">Notes<textarea name="notes">${esc(existing?.notes || '')}</textarea></label>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save</button></div>
  </form>`, async fd => {
    const record = {
      id: existing?.id || uid(),
      type: fd.get('type'), name: fd.get('name').trim(),
      provider: fd.get('provider').trim(), bankName: fd.get('provider').trim(),
      accountNumber: fd.get('accountNumber').trim(),
      currentValue: Number(fd.get('currentValue')),
      interestRate: Number(fd.get('interestRate') || 0),
      startDate: fd.get('startDate') || '', maturityDate: fd.get('maturityDate') || '',
      notes: fd.get('notes').trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await putOne('investments', record);
    await logActivity('Investment', (existing ? 'Investment updated: ' : 'Investment added: ') + record.name);
    closeModal(); toast(existing ? 'Investment updated' : 'Investment saved');
    await renderInvestments(); await renderOverview();
  });
}

/* ===== Loans (balance trackers only) ===== */
async function renderLoans() {
  const rows = await getAll('loans');
  const N = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  if (!rows.length) { $('loanList').innerHTML = '<div class="empty">No loans added yet.</div>'; return; }
  $('loanList').innerHTML = rows.map(x => {
    const out = x.status === 'Settled' ? 0 : N(x.outstanding);
    const payments = (x.payments || []).slice().reverse();
    const payHtml = payments.length
      ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--muted)">Payment History (${payments.length})</summary>
          <div style="margin-top:6px">${payments.map(p =>
            `<div style="font-size:12px;color:var(--muted);padding:3px 0;border-bottom:1px solid #ffffff08">
              Paid ${money(p.emi, state.settings.currency)} on ${esc(p.date)} · Principal: ${money(p.principal, state.settings.currency)} · Interest: ${money(p.interest, state.settings.currency)} · Balance: ${money(p.outstanding, state.settings.currency)}
            </div>`).join('')}
          </div></details>` : '';
    return `<div class="loan-item">
      <div class="title">${esc(x.name || 'Loan')} <span class="pill">${esc(x.loanType || 'Loan')}</span></div>
      <div class="sub">Principal: ${money(x.principal, state.settings.currency)} · Rate: ${N(x.interestRate).toFixed(2)}%</div>
      <div class="sub">Outstanding: <b class="${out > 0 ? 'red' : 'green'}">${money(out, state.settings.currency)}</b> · Status: ${esc(x.status || 'Active')}</div>
      ${x.dueDate ? `<div class="sub">Next Due: ${esc(x.dueDate)}</div>` : ''}
      ${payHtml}
      <div class="loan-actions">
        <button class="btn-icon" data-ledit="${x.id}" title="Edit">✏️</button>
        <button class="btn-icon danger" data-ldel="${x.id}" title="Delete">🗑️</button>
      </div>
    </div>`;
  }).join('');
  $('loanList').querySelectorAll('[data-ledit]').forEach(b => b.onclick = async () => {
    const x = await getOne('loans', b.dataset.ledit); if (x) loanModal(x);
  });
  $('loanList').querySelectorAll('[data-ldel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this loan?')) return;
    await delOne('loans', b.dataset.ldel);
    await logActivity('Loan', 'Loan deleted');
    await renderLoans(); await renderOverview();
  });
}

$('addLoanBtn').onclick = () => loanModal();

function loanModal(existing = null) {
  const typeOpts = ['Personal Loan','Home Loan','Vehicle Loan','Gold Loan','Education Loan','Other'].map(t => `<option ${existing?.loanType === t ? 'selected' : ''}>${t}</option>`).join('');
  openModal(existing ? 'Edit Loan' : 'Add Loan', `<form class="grid">
    <label>Loan Type<select name="loanType">${typeOpts}</select></label>
    <label>Name / Lender<input name="name" value="${esc(existing?.name || '')}" placeholder="e.g. SBI Home Loan"></label>
    <label>Principal <span class="req-star">*</span><input name="principal" type="number" min="0" step="0.01" required value="${Number(existing?.principal || 0)}"></label>
    <label>Interest Rate (%)<input name="interestRate" type="number" min="0" step="0.01" value="${Number(existing?.interestRate || 0)}"></label>
    <label>Outstanding Balance<input name="outstanding" type="number" min="0" step="0.01" value="${Number(existing?.outstanding || existing?.principal || 0)}"></label>
    <label>EMI / Month<input name="emi" type="number" min="0" step="0.01" value="${Number(existing?.emi || 0)}"></label>
    <label>Next Due Date<input name="dueDate" type="date" value="${esc(existing?.dueDate || '')}"></label>
    <label>Status<select name="status"><option ${existing?.status !== 'Settled' ? 'selected' : ''}>Active</option><option ${existing?.status === 'Settled' ? 'selected' : ''}>Settled</option></select></label>
    <label style="grid-column:1/-1">Notes<textarea name="notes">${esc(existing?.notes || '')}</textarea></label>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save</button></div>
  </form>`, async fd => {
    const record = {
      id: existing?.id || uid(),
      loanType: fd.get('loanType'), name: fd.get('name').trim(),
      principal: Number(fd.get('principal')),
      interestRate: Number(fd.get('interestRate') || 0),
      outstanding: Number(fd.get('outstanding') || fd.get('principal')),
      emi: Number(fd.get('emi') || 0),
      dueDate: fd.get('dueDate') || '',
      status: fd.get('status') || 'Active',
      notes: fd.get('notes').trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (record.principal <= 0) { toast('Enter a valid principal', true); return; }
    await putOne('loans', record);
    await logActivity('Loan', (existing ? 'Loan updated: ' : 'Loan added: ') + record.name);
    // Auto-create/update due date reminder
    if (record.dueDate && record.status !== 'Settled') {
      const remId = 'loan-due-' + record.id;
      await putOne('reminders', {
        id: remId, title: 'Loan EMI Due: ' + (record.name || record.loanType),
        date: record.dueDate, time: '09:00', priority: 'High',
        description: 'Outstanding: ' + record.outstanding + ' · EMI: ' + record.emi,
        completed: false, source: 'loan', loanId: record.id,
        createdAt: new Date().toISOString()
      });
    } else if (record.status === 'Settled') {
      // Remove reminder if loan settled
      await delOne('reminders', 'loan-due-' + record.id).catch(() => {});
    }
    closeModal(); toast(existing ? 'Loan updated' : 'Loan saved');
    await renderLoans(); await renderOverview();
    renderBellReminders();
  });
}

/* ===== Settings wired via shared.js panel ===== */
