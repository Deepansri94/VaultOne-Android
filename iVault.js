'use strict';
/* ===== iVault — own IndexedDB ===== */
const IV_DB = 'iVaultDB';
const IV_VER = 2;
const IV_STORES = ['meta','income','expenses','budgets','investments','loans','reminders','activity','notes','cashWallets'];

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

function budgetCategoryTotal(categories, category) {
  const direct = Number(categories?.[category]);
  const subTotal = Object.entries(categories || {})
    .filter(([key]) => key.startsWith(category + '.'))
    .reduce((total, [, value]) => total + (Number(value) || 0), 0);
  return subTotal > 0 ? subTotal : (Number.isFinite(direct) ? direct : 0);
}

function historySort(a, b) {
  return (b.date || '').localeCompare(a.date || '')
    || (b.createdAt || '').localeCompare(a.createdAt || '')
    || String(b.id || '').localeCompare(String(a.id || ''));
}

let state = { settings: { id:'settings', name:'', currency:'INR' } };
let _currentSV = 'overview';
let _budgetMonth = new Date().toISOString().slice(0,7);

let _budgetLocked = false;
let _budgetEditMode = false; // true only when user explicitly clicks Edit

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
          const result = saveBackupFile(JSON.stringify(data,null,2), 'iVault_Backup_'+today()+'.json');
          await logActivity('Backup','JSON backup exported'); toast(result);
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
  else if (id === 'transactions') await renderTransactions();
  else if (id === 'budget') await renderBudget();
  else if (id === 'investments') await renderInvestments();
  else if (id === 'loans') await renderLoans();
}

async function renderTransactions() {
  const [income, expenses] = await Promise.all([getAll('income'), getAll('expenses')]);
  const rows = [
    ...income.map(row => ({ ...row, transactionType: 'Income', description: row.note || row.type || 'Income' })),
    ...expenses.map(row => ({ ...row, transactionType: 'Expense', description: row.note || row.subcategory || row.category || 'Expense' }))
  ].sort((a, b) => historySort(a, b));
  const body = rows.map(row => `<tr>
    <td>${esc(row.date || '')}</td>
    <td><span class="pill">${row.transactionType}</span></td>
    <td>${esc(row.description)}</td>
    <td>${esc(row.category || row.type || '')}</td>
    <td class="${row.transactionType === 'Expense' ? 'red' : 'green'}"><b>${row.transactionType === 'Expense' ? '-' : '+'}${money(row.amount, state.settings.currency)}</b></td>
    <td><div class="table-actions">
      <button class="btn-icon" data-txedit="${row.id}" data-txtype="${row.transactionType}" title="Edit">✏️</button>
      <button class="btn-icon danger" data-txdel="${row.id}" data-txtype="${row.transactionType}" title="Delete">🗑️</button>
    </div></td>
  </tr>`).join('');
  const el = $('transactionList');
  el.innerHTML = rows.length
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Category</th><th>Amount</th><th>Actions</th></tr></thead><tbody>${body}</tbody></table></div>`
    : '<div class="empty">No income or expense transactions yet.</div>';
  el.querySelectorAll('[data-txedit]').forEach(b => b.onclick = () => {
    if (b.dataset.txtype === 'Income') incomeEditModal(b.dataset.txedit);
    else expenseEditModal(b.dataset.txedit);
  });
  el.querySelectorAll('[data-txdel]').forEach(b => b.onclick = async () => {
    const store = b.dataset.txtype === 'Income' ? 'income' : 'expenses';
    if (!confirm(`Delete this ${b.dataset.txtype.toLowerCase()} record?`)) return;
    await delOne(store, b.dataset.txdel);
    await logActivity(b.dataset.txtype, `${b.dataset.txtype} deleted`);
    await renderTransactions(); await renderOverview();
  });
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
  const currentGoldPrice = N(state.settings.currentGoldPricePerGram);
  const currentDematValue = N(state.settings.currentDematPortfolioValue);
  const invAssets = inv.reduce((s,x) => s + (x.type === 'Gold' && currentGoldPrice > 0
    ? N(x.grams) * currentGoldPrice
    : x.type === 'Demat' && currentDematValue > 0 ? 0 : N(x.currentValue)), 0) + currentDematValue;
  const totalInc = inc.reduce((s,x) => s + N(x.amount), 0);
  const totalExp = exp.reduce((s,x) => s + N(x.amount), 0);
  const cashSavings = Math.max(0, totalInc - totalExp);
  const loanLiab = loans.filter(x => x.status !== 'Settled').reduce((s,x) => s + N(x.outstanding), 0);
  const netWorth = invAssets + cashSavings - loanLiab;

  $('statNetWorth').textContent = money(netWorth, state.settings.currency);
  $('statIncome').textContent = money(mInc, state.settings.currency);
  $('statExpense').textContent = money(mExp, state.settings.currency);
  $('statSavings').textContent = money(Math.max(0, mInc - mExp), state.settings.currency);
  renderCashWallets();

  // Budget bar
  const budRec = bud.find(b => b.month === month);
  const bt = budRec ? BUDGET_CATS.reduce((total, category) => total + budgetCategoryTotal(budRec.categories, category), 0) : 0;
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

/* ===== Cash wallets ===== */
async function cashPosition() {
  const [wallets, income, expenses] = await Promise.all([getAll('cashWallets'), getAll('income'), getAll('expenses')]);
  const N = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const withdrawals = wallets.reduce((sum, wallet) => sum + (wallet.movements || []).filter(m => m.type === 'withdrawal').reduce((s, m) => s + N(m.amount), 0), 0);
  const regularExpenses = expenses.filter(expense => !expense.walletId).reduce((sum, expense) => sum + N(expense.amount), 0);
  const account = income.reduce((sum, row) => sum + N(row.amount), 0) - regularExpenses - withdrawals;
  const wallet = wallets.reduce((sum, row) => sum + N(row.balance), 0);
  return { wallets, account, wallet };
}

async function renderCashWallets() {
  const position = await cashPosition();
  if ($('accountBalance')) $('accountBalance').textContent = money(position.account, state.settings.currency);
  if ($('walletBalance')) $('walletBalance').textContent = money(position.wallet, state.settings.currency);
  if (!$('cashWalletList')) return;
  $('cashWalletSummary').textContent = `Account: ${money(position.account, state.settings.currency)} · Wallets: ${money(position.wallet, state.settings.currency)}`;
  $('cashWalletList').innerHTML = position.wallets.length
    ? position.wallets.map(wallet => `<div class="item"><div style="min-width:0"><div class="title">${esc(wallet.name)}</div><div class="sub">${esc(wallet.category || 'Other')} · ${esc(wallet.subcategory || 'Uncategorized')}</div><div class="sub">Balance: <b>${money(wallet.balance, state.settings.currency)}</b></div></div><div class="actions" style="margin-top:0;align-items:center"><span class="pill">Cash</span><button class="btn-icon danger" type="button" data-wallet-delete="${esc(wallet.id)}" title="Delete wallet" aria-label="Delete ${esc(wallet.name)}">🗑️</button></div></div>`).join('')
    : '<div class="empty">No cash wallets yet. Create one for a specific purpose.</div>';
}

async function deleteCashWallet(id) {
  const wallet = await getOne('cashWallets', id);
  if (!wallet) return;
  if (Number(wallet.balance || 0) > 0) { toast('Spend or transfer the remaining wallet cash before deleting', true); return; }
  if (!confirm(`Delete the cash wallet "${wallet.name}"? Its history will also be deleted.`)) return;
  await delOne('cashWallets', id);
  await logActivity('Cash Wallet', `Wallet deleted: ${wallet.name}`);
  toast('Cash wallet deleted');
  await renderOverview();
}

function walletOptions(wallets) {
  return wallets.map(wallet => `<option value="${esc(wallet.id)}">${esc(wallet.name)} · ${money(wallet.balance, state.settings.currency)}</option>`).join('');
}

function walletCategoryOptions(selected) {
  return BUDGET_CATS.map(category => `<option ${category === selected ? 'selected' : ''}>${esc(category)}</option>`).join('');
}

function walletSubcategoryOptions(category, selected) {
  return [''].concat(getSubcats(category)).map(subcategory => `<option value="${esc(subcategory)}" ${subcategory === selected ? 'selected' : ''}>${esc(subcategory || '-- select --')}</option>`).join('');
}

async function addCashWallet() {
  const defaultCategory = 'Other';
  openModal('New Cash Wallet', `<form class="grid"><label>Wallet name <span class="req-star">*</span><input name="name" required placeholder="e.g. Sabarimala Temple"></label><label>Category <span class="req-star">*</span><select name="category" id="walletCategorySelect">${walletCategoryOptions(defaultCategory)}</select></label><label>Sub-category<select name="subcategory" id="walletSubcategorySelect">${walletSubcategoryOptions(defaultCategory, '')}</select></label><div class="actions" style="grid-column:1/-1"><button type="submit" class="btn primary">Create Wallet</button></div></form>`, async fd => {
    const name = String(fd.get('name') || '').trim();
    if (!name) { toast('Enter a wallet name', true); return; }
    const category = String(fd.get('category') || 'Other');
    const subcategory = String(fd.get('subcategory') || '');
    await putOne('cashWallets', { id: uid(), name, category, subcategory, balance: 0, movements: [], createdAt: new Date().toISOString() });
    await logActivity('Cash Wallet', `Wallet created: ${name}`);
    closeModal(); toast('Cash wallet created'); await renderCashWallets();
  });
  setTimeout(() => $('walletCategorySelect')?.addEventListener('change', event => {
    $('walletSubcategorySelect').innerHTML = walletSubcategoryOptions(event.target.value, '');
  }), 0);
}

async function addCashToWallet() {
  const position = await cashPosition();
  if (!position.wallets.length) { toast('Create a cash wallet first', true); return; }
  openModal('Add Cash to Wallet', `<form class="grid"><label>Amount <span class="req-star">*</span><input name="amount" type="number" min="0.01" step="0.01" required></label><label>Cash Wallet<select name="walletId" required>${walletOptions(position.wallets)}</select></label><label style="grid-column:1/-1">Purpose<input name="purpose" placeholder="Temple, medicine, milk..."></label><div class="actions" style="grid-column:1/-1"><button type="submit" class="btn primary">Add Cash</button></div></form>`, async fd => {
    const amount = Number(fd.get('amount')); const wallet = position.wallets.find(row => row.id === fd.get('walletId'));
    if (amount <= 0 || !wallet) { toast('Enter a valid amount and wallet', true); return; }
    if (amount > position.account) { toast('Add amount exceeds available account balance', true); return; }
    wallet.balance = Number(wallet.balance || 0) + amount;
    wallet.movements = [...(wallet.movements || []), { id: uid(), type: 'withdrawal', amount, purpose: fd.get('purpose') || '', date: today(), createdAt: new Date().toISOString() }];
    await putOne('cashWallets', wallet); await logActivity('Cash Wallet', `Cash added to ${wallet.name}`);
    closeModal(); toast('Cash added to wallet'); await renderOverview();
  });
}

async function spendFromCashWallet() {
  const position = await cashPosition();
  if (!position.wallets.length) { toast('Create a cash wallet first', true); return; }
  openModal('Spend Cash', `<form class="grid"><label>Amount <span class="req-star">*</span><input name="amount" type="number" min="0.01" step="0.01" required></label><label>Cash Wallet<select name="walletId" required>${walletOptions(position.wallets)}</select></label><label style="grid-column:1/-1">Purpose <span class="req-star">*</span><input name="purpose" required placeholder="Medicine, milk, offering..."></label><div class="actions" style="grid-column:1/-1"><button type="submit" class="btn primary">Record Cash Expense</button></div></form>`, async fd => {
    const amount = Number(fd.get('amount')); const wallet = position.wallets.find(row => row.id === fd.get('walletId')); const purpose = String(fd.get('purpose') || '').trim();
    if (amount <= 0 || !wallet || !purpose) { toast('Enter a valid amount, wallet, and purpose', true); return; }
    if (amount > Number(wallet.balance || 0)) { toast('Spend exceeds this wallet balance', true); return; }
    wallet.balance = Number(wallet.balance || 0) - amount;
    wallet.movements = [...(wallet.movements || []), { id: uid(), type: 'spend', amount, purpose, date: today(), createdAt: new Date().toISOString() }];
    await putOne('cashWallets', wallet);
    await putOne('expenses', { id: uid(), category: wallet.category || 'Other', subcategory: wallet.subcategory || '', amount, date: today(), note: `${purpose} · Cash wallet: ${wallet.name}`, walletId: wallet.id, createdAt: new Date().toISOString() });
    await logActivity('Expense', `Cash spent from ${wallet.name}`);
    closeModal(); toast('Cash expense recorded'); await renderOverview();
  });
}

function wireCashWallets() {
  $('cashWalletFab')?.addEventListener('click', () => { $('cashWalletPanel').classList.toggle('open'); renderCashWallets(); });
  $('cashWalletPanelClose')?.addEventListener('click', () => $('cashWalletPanel').classList.remove('open'));
  $('cashWalletAddBtn')?.addEventListener('click', addCashWallet);
  $('cashWalletWithdrawBtn')?.addEventListener('click', addCashToWallet);
  $('cashWalletSpendBtn')?.addEventListener('click', spendFromCashWallet);
  $('cashWalletList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-wallet-delete]');
    if (button) deleteCashWallet(button.dataset.walletDelete);
  });
}

wireCashWallets();

/* ===== Income ===== */
async function renderIncome() {
  const rows = await getAll('income');
  const sorted = rows.slice().sort(historySort);
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
async function incomeEditModal(id) {
  const row = await getOne('income', id); if (!row) return;
  const typeOpts = ['Salary','Shift Allowance','Interest','Dividend','Other Income']
    .map(type => `<option ${row.type === type ? 'selected' : ''}>${esc(type)}</option>`).join('');
  openModal('Edit Income', `<form class="grid">
    <label>Type<select name="type">${typeOpts}</select></label>
    <label>Amount <span class="req-star">*</span><input name="amount" type="number" min="0" step="0.01" required value="${Number(row.amount || 0)}"></label>
    <label>Date <span class="req-star">*</span><input name="date" type="date" required value="${esc(row.date || '')}"></label>
    <label>Note<input name="note" value="${esc(row.note || '')}" placeholder="Optional note"></label>
    <div class="actions" style="grid-column:1/-1"><button type="submit" class="btn primary">Save Changes</button></div>
  </form>`, async fd => {
    const amount = Number(fd.get('amount'));
    if (amount <= 0) { toast('Enter a valid amount', true); return; }
    row.type = fd.get('type') || 'Income';
    row.amount = amount;
    row.date = fd.get('date') || today();
    row.note = fd.get('note') || '';
    row.updatedAt = new Date().toISOString();
    await putOne('income', row);
    await logActivity('Income', 'Income updated');
    closeModal(); toast('Income updated');
    await renderIncome(); await renderOverview();
  });
}

/* ===== Expenses ===== */
async function renderExpenses() {
  const rows = await getAll('expenses');
  const sorted = rows.slice().sort(historySort);
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
const INV_LINKABLE = ['RD','PPF','SSA','NPS','Demat','Insurance','Other Saving'];

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
    linkedSel.innerHTML = '<option value="">— select investment/insurance —</option>' +
      invs.map(x => {
        const label = x.type === 'Insurance'
          ? `${esc(x.name)} · Premium: ${money(x.premiumAmount || 0, state.settings.currency)} · Due: ${esc(x.premiumDueDate || '—')}`
          : x.type === 'Demat'
            ? `${esc(x.name || x.type)} · Invested: ${money(x.investedValue ?? x.purchaseValue ?? x.openingBalance, state.settings.currency)} · Portfolio: ${money(state.settings.currentDematPortfolioValue || x.currentValue, state.settings.currency)}`
          : `${esc(x.name || x.type)} (${esc(x.type)}) · ${money(x.currentValue, state.settings.currency)}`;
        return `<option value="${x.id}">${label}</option>`;
      }).join('');
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


// Wire directly -- script runs at end of body so DOM is already parsed
const _expCatSel = document.querySelector('#expenseForm [name="category"]');
_expCatSel?.addEventListener('change', () => populateExpLinked(_expCatSel.value));
if (_expCatSel) populateExpLinked(_expCatSel.value);

$('budgetEditBtn').addEventListener('click', () => {
  _budgetLocked = false;
  _budgetEditMode = true;
  $('budgetEditBtn').style.display = 'none';
  renderBudget();
});

$('incomeForm').onsubmit = async e => {
  e.preventDefault();
  const form = e.currentTarget;
  const fd = new FormData(form);
  const amount = Number(fd.get('amount'));
  if (amount <= 0) { toast('Enter a valid amount', true); return; }
  await putOne('income', { id: uid(), type: fd.get('type'), amount, date: fd.get('date') || today(), note: fd.get('note') || '', createdAt: new Date().toISOString() });
  await logActivity('Income', 'Income saved');
  toast('Income saved');
  form.querySelector('[name="amount"]').value = '';
  form.querySelector('[name="note"]').value = '';
  form.querySelector('[name="date"]').value = today();
  await renderIncome(); await renderOverview();
};

$('expenseForm').onsubmit = async e => {
  e.preventDefault();
  const form = e.currentTarget;
  const fd = new FormData(form);
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
      if (inv.type === 'Insurance') {
        // Record premium payment and advance due date
        if (!inv.payments) inv.payments = [];
        inv.payments.push({ date, amount, note: fd.get('note') || '' });
        // Advance due date by frequency
        if (inv.premiumDueDate) {
          const d = new Date(inv.premiumDueDate + 'T00:00:00');
          const freq = inv.premiumFrequency || 'Yearly';
          if (freq === 'Monthly')      d.setMonth(d.getMonth() + 1);
          else if (freq === 'Quarterly') d.setMonth(d.getMonth() + 3);
          else if (freq === 'Half-Yearly') d.setMonth(d.getMonth() + 6);
          else                           d.setFullYear(d.getFullYear() + 1);
          const pad = n => String(n).padStart(2,'0');
          inv.premiumDueDate = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
          // Update reminder to next due date
          await putOne('reminders', {
            id: 'ins-due-' + inv.id,
            title: 'Insurance Premium Due: ' + inv.name,
            date: inv.premiumDueDate, time: '09:00', priority: 'High',
            description: `Premium: ${money(inv.premiumAmount || amount, state.settings.currency)} · Insurer: ${inv.provider || ''}`,
            completed: false, source: 'insurance', investmentId: inv.id,
            createdAt: new Date().toISOString()
          });
          renderBellReminders();
        }
        await putOne('investments', inv);
        await logActivity('Insurance', `Premium paid: ${money(amount, state.settings.currency)} for ${inv.name}`);
        paidMsg = `Premium of ${money(amount, state.settings.currency)} paid for "${subcategory}" on ${date}`;
      } else if (inv.type === 'Demat') {
        inv.investedValue = (Number(inv.investedValue ?? inv.purchaseValue ?? inv.openingBalance) || 0) + amount;
        inv.purchaseValue = inv.investedValue;
        await putOne('investments', inv);
        await logActivity('Demat', `Contribution: ${money(amount, state.settings.currency)} added to ${inv.name}`);
        paidMsg = `Added ${money(amount, state.settings.currency)} to "${subcategory}" purchase value on ${date}`;
      } else {
        inv.currentValue = (Number(inv.currentValue) || 0) + amount;
        await putOne('investments', inv);
        await logActivity('Investment', `Top-up: ${money(amount, state.settings.currency)} added to ${inv.name}`);
        paidMsg = `Added ${money(amount, state.settings.currency)} to "${subcategory}" on ${date}`;
      }
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
  form.querySelector('[name="amount"]').value = '';
  form.querySelector('[name="note"]').value = '';
  form.querySelector('[name="date"]').value = today();
  $('expSubcatLabel').style.display = '';
  $('expLinkedLabel').style.display = 'none';
  const _ec2 = form.querySelector('[name="category"]');
  if (_ec2) { _ec2.value = 'Household'; await populateExpLinked('Household'); }
  await renderExpenses(); await renderOverview();
};



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

  // Lock if a saved record exists and user hasn't explicitly clicked Edit
  if (rec && !_budgetEditMode) _budgetLocked = true;
  else if (!rec) _budgetLocked = false;

  $('budgetCategoryFields').innerHTML = BUDGET_CATS.map(c => {
    const safeId = c.replace(/[^a-z0-9]/gi, '_');
    const subs = getSubcats(c);
    const subRows = subs.map(s => {
      const safeSub = (c + '_' + s).replace(/[^a-z0-9]/gi, '_');
      return `<div style="display:grid;grid-template-columns:1fr auto 120px;gap:6px;align-items:center;margin-bottom:4px;padding-left:16px">
        <span class="budget-sublabel" data-cat="${esc(c)}" data-sub="${esc(s)}" style="font-size:12px;color:#94a3b8;cursor:pointer" title="Click to rename">${esc(s)}</span>
        <button type="button" class="btn-icon" data-rensub data-cat="${esc(c)}" data-sub="${esc(s)}" title="Rename">✏️</button>
        <input name="sub_${safeSub}" type="number" min="0" step="1" value="${Number(cats[c + '.' + s] || 0)}" data-budget-sub="${esc(c)}" style="margin-top:0;font-size:12px;padding:5px 8px">
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

  // Keep each category amount synchronized with entered subcategory amounts.
  BUDGET_CATS.forEach(c => {
    const categoryInput = $('budgetCategoryFields').querySelector(`[name="cat_${c.replace(/[^a-z0-9]/gi, '_')}"]`);
    const subInputs = [...$('budgetCategoryFields').querySelectorAll(`[data-budget-sub="${c}"]`)];
    if (!categoryInput || !subInputs.length) return;
    const syncCategoryTotal = () => {
      const values = subInputs.map(input => Number(input.value) || 0);
      if (values.some(value => value > 0)) categoryInput.value = values.reduce((total, value) => total + value, 0);
    };
    subInputs.forEach(input => input.addEventListener('input', syncCategoryTotal));
    syncCategoryTotal();
  });

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
    $('budgetForm').querySelectorAll('input[type="number"]').forEach(el => el.disabled = false);
    $('budgetForm').querySelector('button[type="submit"]').disabled = false;
    $('budgetCategoryFields').querySelectorAll('button').forEach(el => el.disabled = false);
    if (budgetEditBtn) budgetEditBtn.style.display = 'none';
  }

  // Actuals
  const exp = await getAll('expenses');
  const mExp = exp.filter(x => (x.date || '').startsWith(month));
  const actuals = {};
  BUDGET_CATS.forEach(c => { actuals[c] = mExp.filter(x => x.category === c).reduce((a, b) => a + Number(b.amount || 0), 0); });
  const bt = BUDGET_CATS.reduce((total, category) => total + budgetCategoryTotal(cats, category), 0);
  const wantBudget = ['Transport', 'Food & Personal', 'Family / Religious / Social', 'Other']
    .reduce((total, category) => total + budgetCategoryTotal(cats, category), 0);
  const needBudget = ['Household', 'Health & Emergency', 'Loans & Financial']
    .reduce((total, category) => total + budgetCategoryTotal(cats, category), 0);
  const saveBudget = budgetCategoryTotal(cats, 'Savings & Investments');
  const percent = value => bt ? Math.round(value / bt * 100) : 0;
  $('budgetWantPercent').textContent = percent(wantBudget) + '%';
  $('budgetNeedPercent').textContent = percent(needBudget) + '%';
  $('budgetSavePercent').textContent = percent(saveBudget) + '%';
  $('budgetDistributionMessage').textContent = bt
    ? percent(saveBudget) >= 20
      ? 'Great saving discipline. Your distribution is building a strong buffer.'
      : percent(needBudget) <= 50
        ? 'Good balance. Keep your needs controlled and grow your savings when possible.'
        : 'Your needs are taking a large share. Review wants and protect a regular saving amount.'
    : 'Set a budget to see your Want, Need, and Save distribution.';

  if (bt > 0 || mExp.length) {
    $('budgetActualsCard').style.display = 'block';
    const rows = BUDGET_CATS.map(c => {
      const budgeted = budgetCategoryTotal(cats, c);
      const actual = actuals[c] || 0;
      const diff = budgeted - actual;
      const cls = diff >= 0 ? 'good' : 'bad';
      const categoryRow = `<tr><td>${esc(c)}</td><td>${money(budgeted, state.settings.currency)}</td><td>${money(actual, state.settings.currency)}</td><td class="${cls}">${money(diff, state.settings.currency)}</td></tr>`;
      const subcategoryRows = getSubcats(c).map(s => {
        const subBudgeted = Number(cats[c + '.' + s] || 0);
        const subActual = mExp
          .filter(x => x.category === c && x.subcategory === s)
          .reduce((total, x) => total + Number(x.amount || 0), 0);
        const subDiff = subBudgeted - subActual;
        const subCls = subDiff >= 0 ? 'good' : 'bad';
        return `<tr><td style="padding-left:24px;color:#94a3b8">${esc(s)}</td><td>${money(subBudgeted, state.settings.currency)}</td><td>${money(subActual, state.settings.currency)}</td><td class="${subCls}">${money(subDiff, state.settings.currency)}</td></tr>`;
      }).join('');
      return categoryRow + subcategoryRows;
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
  _budgetEditMode = false;
  await renderBudget(); await renderOverview();
};

$('budgetPrev').onclick = () => {
  const d = new Date(_budgetMonth + '-01');
  d.setMonth(d.getMonth() - 1);
  _budgetMonth = d.toISOString().slice(0, 7);
  _budgetLocked = false;
  _budgetEditMode = false;
  renderBudget();
};
$('budgetNext').onclick = () => {
  const d = new Date(_budgetMonth + '-01');
  d.setMonth(d.getMonth() + 1);
  _budgetMonth = d.toISOString().slice(0, 7);
  _budgetLocked = false;
  _budgetEditMode = false;
  renderBudget();
};

/* ===== Investments (balance trackers only) ===== */
const INV_TYPES = ['FD','RD','PPF','SSA','NPS','Demat','Gold','Insurance','Other Saving'];

async function renderInvestments() {
  const rows = await getAll('investments');
  const regularRows = rows.filter(x => x.type !== 'Gold' && x.type !== 'Demat');
  const N = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  if (!regularRows.length) $('invList').innerHTML = '<div class="empty">No savings or investments added yet.</div>';
  const grouped = {};
  INV_TYPES.filter(t => t !== 'Gold').forEach(t => { grouped[t] = regularRows.filter(x => x.type === t); });
  let html = '';
  INV_TYPES.filter(t => t !== 'Gold').forEach(t => {
    if (!grouped[t].length) return;
    html += `<div class="inv-section-head">${esc(t)}</div>`;
    html += grouped[t].map(x => {
      const isIns = x.type === 'Insurance';
      const payments = (x.payments || []).slice().reverse();
      const payHtml = isIns && payments.length
        ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--muted)">Premium History (${payments.length})</summary>
            <div style="margin-top:6px">${payments.map(p =>
              `<div style="font-size:12px;color:var(--muted);padding:3px 0;border-bottom:1px solid #ffffff08">
                Paid ${money(p.amount, state.settings.currency)} on ${esc(p.date)}${p.note ? ' · ' + esc(p.note) : ''}
              </div>`).join('')}
            </div></details>` : '';
      const valueRow = isIns
        ? `<div class="sub">Premium: <b>${money(x.premiumAmount || 0, state.settings.currency)}</b> · ${esc(x.premiumFrequency || 'Yearly')}</div>
           <div class="sub">Next Due: <b class="${x.premiumDueDate ? 'warn' : 'muted'}">${esc(x.premiumDueDate || '—')}</b></div>`
        : `<div class="sub">Current Value: <b>${money(x.currentValue, state.settings.currency)}</b></div>`;
      return `<div class="item" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="min-width:0;flex:1">
            <div class="title">${esc(x.name || x.type)}</div>
            <div class="sub">${esc(x.provider || x.bankName || '')}${x.accountNumber ? ' · ' + esc(x.accountNumber) : ''}</div>
            ${valueRow}
          </div>
          <div class="actions">
            <button class="btn-icon" data-invedit="${x.id}" title="Edit">✏️</button>
            <button class="btn-icon danger" data-invdel="${x.id}" title="Delete">🗑️</button>
          </div>
        </div>
        ${payHtml}
      </div>`;
    }).join('');
  });
  if (regularRows.length) $('invList').innerHTML = html;
  $('invList').querySelectorAll('[data-invedit]').forEach(b => b.onclick = async () => {
    const x = await getOne('investments', b.dataset.invedit); if (x) invModal(x);
  });
  $('invList').querySelectorAll('[data-invdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this investment?')) return;
    await delOne('investments', b.dataset.invdel);
    await logActivity('Investment', 'Investment deleted');
    await renderInvestments(); await renderOverview();
  });
  const goldRows = rows.filter(x => x.type === 'Gold');
  const currentPriceInput = $('currentGoldPricePerGram');
  if (currentPriceInput) currentPriceInput.value = Number(state.settings.currentGoldPricePerGram || 0) || '';
  $('updateGoldPriceBtn').onclick = () => {
    const editor = $('goldPriceEditor');
    if (editor) {
      const isHidden = editor.style.display === 'none';
      editor.style.display = isHidden ? 'flex' : 'none';
    }
  };
  $('saveGoldPriceBtn').onclick = async () => {
    const price = Number(currentPriceInput?.value || 0);
    if (price <= 0) { toast('Enter a valid current gold price', true); return; }
    state.settings.currentGoldPricePerGram = price;
    await putOne('meta', { ...state.settings, id: 'settings' });
    toast('Current gold price updated');
    $('goldPriceEditor').style.display = 'none';
    renderGoldOverview(goldRows); await renderOverview();
  };
  renderGoldOverview(goldRows);
  const dematRows = rows.filter(x => x.type === 'Demat');
  const dematValueInput = $('currentDematPortfolioValue');
  if (dematValueInput) dematValueInput.value = Number(state.settings.currentDematPortfolioValue || 0) || '';
  $('updateDematValueBtn').onclick = () => {
    const editor = $('dematValueEditor');
    if (editor) editor.style.display = editor.style.display === 'none' ? 'flex' : 'none';
  };
  $('saveDematValueBtn').onclick = async () => {
    const value = Number(dematValueInput?.value || 0);
    if (value <= 0) { toast('Enter a valid portfolio value', true); return; }
    state.settings.currentDematPortfolioValue = value;
    await putOne('meta', { ...state.settings, id: 'settings' });
    $('dematValueEditor').style.display = 'none';
    toast('Portfolio value updated');
    renderDematOverview(dematRows); await renderOverview();
  };
  renderDematOverview(dematRows);
}

$('addInvBtn').onclick = () => invModal();
$('addGoldBtn').onclick = () => goldModal();
$('addDematBtn').onclick = () => dematModal();

function renderGoldOverview(rows) {
  const totalGrams = rows.reduce((total, row) => total + (Number(row.grams) || 0), 0);
  const purchaseValue = rows.reduce((total, row) => total + (Number(row.purchaseValue) || 0), 0);
  const currentGoldPrice = Number(state.settings.currentGoldPricePerGram) || 0;
  const currentValue = currentGoldPrice > 0
    ? totalGrams * currentGoldPrice
    : rows.reduce((total, row) => total + (Number(row.currentValue) || 0), 0);
  const profitLoss = currentValue - purchaseValue;
  const summary = rows.length ? `<div class="stats" style="margin-bottom:14px">
    <div class="stat">Total Gold<b>${totalGrams.toFixed(3)} g</b></div>
    <div class="stat">Purchase Value<b>${money(purchaseValue, state.settings.currency)}</b></div>
    <div class="stat">Current Value<b>${money(currentValue, state.settings.currency)}</b></div>
    <div class="stat">Profit / Loss<b class="${profitLoss >= 0 ? 'green' : 'red'}">${money(profitLoss, state.settings.currency)}</b></div>
  </div>` : '';
  const list = rows.length ? `<div class="inv-section-head">Gold Holdings</div>${rows.map(row => {
    const value = currentGoldPrice > 0 ? (Number(row.grams) || 0) * currentGoldPrice : (Number(row.currentValue) || 0);
    const purchase = Number(row.purchaseValue) || 0;
    return `<div class="item">
      <div><div class="title">${esc(row.name || 'Gold')}</div><div class="sub">${(Number(row.grams) || 0).toFixed(3)} g · ${esc(row.goldType || 'Jewellery')} · Purchase ${money(purchase, state.settings.currency)}</div></div>
      <b class="${value >= purchase ? 'green' : 'red'}">${money(value, state.settings.currency)}</b>
      <div class="actions"><button class="btn-icon" data-gold-edit="${row.id}" title="Edit">✏️</button><button class="btn-icon danger" data-gold-delete="${row.id}" title="Delete">🗑️</button></div>
    </div>`;
  }).join('')}` : '<div class="empty">No gold holdings added yet.</div>';
  $('goldOverview').innerHTML = `<div class="muted" style="font-size:12px;margin-bottom:8px">Current value uses the shared current gold price above.</div>` + summary + list;
  $('goldOverview').querySelectorAll('[data-gold-edit]').forEach(button => button.onclick = async () => {
    const row = await getOne('investments', button.dataset.goldEdit);
    if (row) goldModal(row);
  });
  $('goldOverview').querySelectorAll('[data-gold-delete]').forEach(button => button.onclick = async () => {
    if (!confirm('Delete this gold holding?')) return;
    await delOne('investments', button.dataset.goldDelete);
    await logActivity('Gold', 'Gold holding deleted');
    await renderInvestments(); await renderOverview();
  });
}

function renderDematOverview(rows) {
  const investedValue = rows.reduce((total, row) => total + (Number(row.investedValue ?? row.purchaseValue ?? row.openingBalance) || 0), 0);
  const portfolioValue = Number(state.settings.currentDematPortfolioValue) || (rows.length ? rows.reduce((total, row) => total + (Number(row.currentValue) || 0), 0) : 0);
  const profitLoss = portfolioValue - investedValue;
  const summary = rows.length ? `<div class="stats" style="margin-bottom:14px">
    <div class="stat">Invested Value<b>${money(investedValue, state.settings.currency)}</b></div>
    <div class="stat">Portfolio Value<b>${money(portfolioValue, state.settings.currency)}</b></div>
    <div class="stat">Overall P&amp;L<b class="${profitLoss >= 0 ? 'green' : 'red'}">${money(profitLoss, state.settings.currency)}</b></div>
  </div>` : '';
  const list = rows.length ? `<div class="inv-section-head">Demat Accounts</div>${rows.map(row => `<div class="item">
    <div><div class="title">${esc(row.name || 'Demat Account')}</div><div class="sub">Invested Value: ${money(row.investedValue ?? row.purchaseValue ?? row.openingBalance, state.settings.currency)}</div></div>
    <b class="${portfolioValue >= investedValue ? 'green' : 'red'}">Portfolio Value: ${money(portfolioValue, state.settings.currency)}</b>
    <div class="actions"><button class="btn-icon" data-demat-edit="${row.id}" title="Edit">✏️</button><button class="btn-icon danger" data-demat-delete="${row.id}" title="Delete">🗑️</button></div>
  </div>`).join('')}` : '<div class="empty">No Demat account added yet.</div>';
  $('dematOverview').innerHTML = summary + list;
  $('dematOverview').querySelectorAll('[data-demat-edit]').forEach(button => button.onclick = async () => {
    const row = await getOne('investments', button.dataset.dematEdit);
    if (row) dematModal(row);
  });
  $('dematOverview').querySelectorAll('[data-demat-delete]').forEach(button => button.onclick = async () => {
    if (!confirm('Delete this Demat account?')) return;
    await delOne('investments', button.dataset.dematDelete);
    await logActivity('Demat', 'Demat account deleted');
    await renderInvestments(); await renderOverview();
  });
}

function dematModal(existing = null) {
  openModal(existing ? 'Edit Demat Account' : 'Add Demat Account', `<form class="grid">
    <label>Account Name <span class="req-star">*</span><input name="name" required value="${esc(existing?.name || '')}" placeholder="e.g. ABC Securities"></label>
    <label>Invested Value <span class="req-star">*</span><input name="investedValue" type="number" min="0" step="0.01" required value="${Number(existing?.investedValue ?? existing?.purchaseValue ?? existing?.openingBalance ?? 0)}"></label>
    <label style="grid-column:1/-1">Notes<textarea name="notes" placeholder="Optional notes">${esc(existing?.notes || '')}</textarea></label>
    <div class="muted" style="grid-column:1/-1;font-size:12px">Monthly contributions are added through Expenses &gt; Savings &amp; Investments &gt; this Demat account.</div>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save Demat</button></div>
  </form>`, async fd => {
    const investedValue = Number(fd.get('investedValue') || 0);
    const name = String(fd.get('name') || '').trim();
    if (!name || investedValue < 0) { toast('Enter valid Demat details', true); return; }
    await putOne('investments', {
      id: existing?.id || uid(), type: 'Demat', name, investedValue,
      purchaseValue: investedValue,
      currentValue: Number(existing?.currentValue || 0), notes: String(fd.get('notes') || '').trim(),
      createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await logActivity('Demat', (existing ? 'Demat updated: ' : 'Demat added: ') + name);
    closeModal(); toast(existing ? 'Demat updated' : 'Demat saved');
    await renderInvestments(); await renderOverview();
  });
}

function goldModal(existing = null) {
  const goldType = existing?.goldType || 'Jewellery';
  openModal(existing ? 'Edit Gold' : 'Add Gold', `<form class="grid">
    <label>Name <span class="req-star">*</span><input name="name" required value="${esc(existing?.name || '')}" placeholder="e.g. Gold chain"></label>
    <label>Grams <span class="req-star">*</span><input name="grams" type="number" min="0.001" step="0.001" required value="${Number(existing?.grams || 0) || ''}"></label>
    <label>Type <select name="goldType"><option ${goldType === 'Coin' ? 'selected' : ''}>Coin</option><option ${goldType === 'Jewellery' ? 'selected' : ''}>Jewellery</option></select></label>
    <label>Current Price per Gram <span class="req-star">*</span><input name="goldRate" type="number" min="0" step="0.01" required placeholder="e.g. 6500" value="${Number(existing?.goldRate || 0) || ''}"></label>
    <label>Making Charge <input name="makingCharge" type="number" min="0" step="0.01" value="${Number(existing?.makingCharge || 0)}"></label>
    <label>GST (%) <input name="gstRate" type="number" min="0" step="0.01" value="${Number(existing?.gstRate || 0)}"></label>
    <label>Purchase Total <input name="purchaseTotal" type="number" readonly value="${Number(existing?.purchaseValue || 0)}"></label>
    <div class="muted" id="goldCalcInfo" style="grid-column:1/-1;font-size:12px"></div>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save Gold</button></div>
  </form>`, async fd => {
    const grams = Number(fd.get('grams') || 0);
    const goldRate = Number(fd.get('goldRate') || 0);
    const makingCharge = Number(fd.get('makingCharge') || 0);
    const gstRate = Number(fd.get('gstRate') || 0);
    const subtotal = grams * goldRate + makingCharge;
    const purchaseValue = subtotal + subtotal * gstRate / 100;
    if (!String(fd.get('name') || '').trim() || grams <= 0 || goldRate < 0 || makingCharge < 0 || gstRate < 0) {
      toast('Enter valid gold details', true); return;
    }
    await putOne('investments', {
      id: existing?.id || uid(), type: 'Gold', name: String(fd.get('name')).trim(), grams, goldType: fd.get('goldType'),
      goldRate, makingCharge, gstRate, purchaseValue, currentValue: existing?.currentValue || purchaseValue,
      createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await logActivity('Gold', (existing ? 'Gold updated: ' : 'Gold added: ') + String(fd.get('name')).trim());
    closeModal(); toast(existing ? 'Gold updated' : 'Gold saved');
    await renderInvestments(); await renderOverview();
  });
  const form = $('modalBody').querySelector('form');
  const updateGoldTotal = () => {
    const grams = Number(form.elements.grams.value) || 0;
    const rate = Number(form.elements.goldRate.value) || 0;
    const making = Number(form.elements.makingCharge.value) || 0;
    const gstRate = Number(form.elements.gstRate.value) || 0;
    const subtotal = grams * rate + making;
    const total = subtotal + subtotal * gstRate / 100;
    form.elements.purchaseTotal.value = total.toFixed(2);
    $('goldCalcInfo').textContent = `Gold value ${money(grams * rate, state.settings.currency)} + making ${money(making, state.settings.currency)} + GST ${money(total - subtotal, state.settings.currency)} = ${money(total, state.settings.currency)}`;
  };
  ['grams', 'goldRate', 'makingCharge', 'gstRate'].forEach(name => form.elements[name].addEventListener('input', updateGoldTotal));
  updateGoldTotal();
}

function invModal(existing = null) {
  const typeOpts = INV_TYPES.map(t => `<option ${existing?.type === t ? 'selected' : ''}>${t}</option>`).join('');
  const isIns = existing?.type === 'Insurance';
  const freqOpts = ['Monthly','Quarterly','Half-Yearly','Yearly'].map(f =>
    `<option ${(existing?.premiumFrequency || 'Yearly') === f ? 'selected' : ''}>${f}</option>`).join('');
  openModal(existing ? 'Edit Investment' : 'Add Investment', `<form class="grid">
    <label>Type <span class="req-star">*</span><select name="type" required id="invTypeSelect">${typeOpts}</select></label>
    <label>Name <span class="req-star">*</span><input name="name" required value="${esc(existing?.name || '')}"></label>
    <label>Provider / Insurer<input name="provider" value="${esc(existing?.provider || existing?.bankName || '')}"></label>
    <label>Account / Policy Number<input name="accountNumber" value="${esc(existing?.accountNumber || '')}"></label>
    <label id="invCurrValLabel" ${isIns ? 'style="display:none"' : ''}>Current Value <span class="req-star">*</span><input name="currentValue" type="number" min="0" step="0.01" value="${Number(existing?.currentValue || 0)}"></label>
    <label id="invPremiumLabel" ${!isIns ? 'style="display:none"' : ''}>Premium Amount <span class="req-star">*</span><input name="premiumAmount" type="number" min="0" step="0.01" value="${Number(existing?.premiumAmount || 0)}"></label>
    <label id="invFreqLabel" ${!isIns ? 'style="display:none"' : ''}>Premium Frequency<select name="premiumFrequency">${freqOpts}</select></label>
    <label id="invPremDueLabel" ${!isIns ? 'style="display:none"' : ''}>Next Premium Due Date<input name="premiumDueDate" type="date" value="${esc(existing?.premiumDueDate || '')}"></label>
    <label>Interest Rate (%)<input name="interestRate" type="number" min="0" step="0.01" value="${Number(existing?.interestRate || 0)}"></label>
    <label>Start Date<input name="startDate" type="date" value="${esc(existing?.startDate || '')}"></label>
    <label id="invMatLabel" ${isIns ? 'style="display:none"' : ''}>Maturity Date<input name="maturityDate" type="date" value="${esc(existing?.maturityDate || '')}"></label>
    <label style="grid-column:1/-1">Notes<textarea name="notes">${esc(existing?.notes || '')}</textarea></label>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save</button></div>
  </form>`, async fd => {
    const type = fd.get('type');
    const isInsurance = type === 'Insurance';
    const record = {
      id: existing?.id || uid(),
      type, name: fd.get('name').trim(),
      provider: fd.get('provider').trim(), bankName: fd.get('provider').trim(),
      accountNumber: fd.get('accountNumber').trim(),
      currentValue: isInsurance ? 0 : Number(fd.get('currentValue') || 0),
      premiumAmount: isInsurance ? Number(fd.get('premiumAmount') || 0) : undefined,
      premiumFrequency: isInsurance ? fd.get('premiumFrequency') : undefined,
      premiumDueDate: isInsurance ? (fd.get('premiumDueDate') || '') : undefined,
      interestRate: Number(fd.get('interestRate') || 0),
      startDate: fd.get('startDate') || '',
      maturityDate: isInsurance ? '' : (fd.get('maturityDate') || ''),
      notes: fd.get('notes').trim(),
      payments: existing?.payments || [],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (isInsurance && record.premiumAmount <= 0) { toast('Enter a valid premium amount', true); return; }
    if (!isInsurance && record.currentValue < 0) { toast('Enter a valid current value', true); return; }
    await putOne('investments', record);
    // Auto-create reminder for insurance premium due date
    if (isInsurance && record.premiumDueDate) {
      await putOne('reminders', {
        id: 'ins-due-' + record.id,
        title: 'Insurance Premium Due: ' + record.name,
        date: record.premiumDueDate, time: '09:00', priority: 'High',
        description: `Premium: ${money(record.premiumAmount, state.settings.currency)} · Frequency: ${record.premiumFrequency} · Insurer: ${record.provider}`,
        completed: false, source: 'insurance', investmentId: record.id,
        createdAt: new Date().toISOString()
      });
      renderBellReminders();
    }
    await logActivity('Investment', (existing ? 'Investment updated: ' : 'Investment added: ') + record.name);
    closeModal(); toast(existing ? 'Investment updated' : 'Investment saved');
    await renderInvestments(); await renderOverview();
  });
  // Toggle Insurance-specific fields when type changes
  setTimeout(() => {
    const sel = document.getElementById('invTypeSelect');
    if (!sel) return;
    sel.addEventListener('change', () => {
      const ins = sel.value === 'Insurance';
      document.getElementById('invCurrValLabel').style.display  = ins ? 'none' : '';
      document.getElementById('invPremiumLabel').style.display  = ins ? '' : 'none';
      document.getElementById('invFreqLabel').style.display     = ins ? '' : 'none';
      document.getElementById('invPremDueLabel').style.display  = ins ? '' : 'none';
      document.getElementById('invMatLabel').style.display      = ins ? 'none' : '';
    });
  }, 0);
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
