# VaultOne 🔐

**Version:** v2.83 · **Schema:** v7 · **Offline-first · Optional Google Sheets sync**

VaultOne is a personal vault that runs directly in any modern browser or as a native Android APK. All data is stored locally on the device using IndexedDB. Optionally, data can be synced to a private Google Sheet via the built-in Apps Script backend — no third-party server, no cloud service.

---

## Table of Contents

- [Features at a Glance](#features-at-a-glance)
- [Getting Started](#getting-started)
- [Modules](#modules)
  - [Home Dashboard](#home-dashboard)
  - [iVault — Personal Finance](#ivault--personal-finance)
  - [FamilyVault — Documents & People](#familyvault--documents--people)
  - [PasswordVault — Encrypted Passwords](#passwordvault--encrypted-passwords)
  - [Reminders — Bell Panel](#reminders--bell-panel)
  - [Settings](#settings)
- [Data Storage](#data-storage)
- [Backup & Restore](#backup--restore)
- [Security](#security)
- [Google Sheets Sync Backend](#google-sheets-sync-backend)
- [Android APK Build](#android-apk-build)
- [Self-Test](#self-test)
- [QA & Test Suite](#qa--test-suite)
- [Project Structure](#project-structure)
- [Release History](#release-history)

---

## Features at a Glance

| Feature | Detail |
|---|---|
| Offline-first | Works with no internet connection |
| Modular architecture | `index.html` entry point with separate module files per section |
| IndexedDB storage | Persistent local storage, schema v7 |
| Google Sheets sync | Optional Apps Script backend — your own private Google Sheet |
| Dual-write layer | Writes go to IndexedDB first (instant), then Sheets in background |
| Encrypted passwords | AES-GCM 256-bit, PIN-derived PBKDF2 key |
| Family documents | Aadhaar, PAN, Passport, Driving Licence and more |
| Full finance suite | Income, Expenses, Budget, FD, RD, PPF, SSA, NPS, Demat, Gold, Loans, Banks |
| Reminders | Manual, auto-generated (loan / insurance / investment due dates), birthday reminders |
| Android notifications | Native AlarmManager notifications via JavaScript bridge |
| Auto-update | APK checks GitHub Releases on launch and prompts to install newer builds |
| Responsive | Desktop browsers and Android mobile (390 px – 1280 px+) |
| Export / Import | Full JSON backup and restore |
| GitHub Pages | `src/` deployed automatically on every push to `main` |

---

## Getting Started

### Browser

1. Clone or download the repository.
2. Open `src/index.html` in any modern browser (Chrome, Edge, Firefox, Safari).
3. All data is saved automatically to the browser's IndexedDB.

> **Note:** Using a private / incognito window will clear IndexedDB when the window closes. Use a normal browser window for persistent storage.

### GitHub Pages

The app is deployed automatically to GitHub Pages on every push to `main` via `deploy-pages.yml`. The `src/` folder is served as the site root — open `index.html` to launch.

### Android APK

Download the latest `VaultOne.apk` from the [GitHub Releases](../../releases) page. The APK is built and published automatically from the `src/` files on every push to `main` via `build-vaultone.yml` — no separate Android project is needed.

The APK wraps the modular web app in a WebView (served via `WebViewAssetLoader`) and adds:
- Native AlarmManager-based reminder notifications (fire even when the app is closed or the device is idle)
- Battery optimization exemption request for reliable alarm delivery
- Native Downloads folder integration for JSON and PDF export
- Native file picker for JSON import
- Auto-update check against GitHub Releases on every launch

---

## Modules

### Home Dashboard

The Home screen is the landing page after the app loads.

- **Welcome message** — personalised with the user's profile name once set.
- **Summary stats** — four cards:
  - **iVault Net Worth** — total assets minus liabilities
  - **Documents** — total document count
  - **Passwords** — total password entries
  - **Reminders** — count of pending (incomplete) reminders
- **Recent Activity** — last 6 activity log entries, sorted newest first.
- **Upcoming Reminders** — next 4 pending reminders sorted by date/time.
- **Quick navigation** — Open iVault, FamilyVault, PasswordVault buttons.

---

### iVault — Personal Finance

Accessed via the **₹ iVault** bottom nav tab. Contains a collapsible Quick Menu with 9 sub-sections.

#### Overview
- Net Worth, monthly Income, monthly Expenses, monthly Savings stats.
- Monthly Budget progress bar and GoldVault current value summary.

#### Income
- Add, edit, delete income transactions.
- Each entry is linked to a bank account; the balance increases automatically.
- A transaction record is created automatically on save.

#### Expenses
- Add, edit, delete expense transactions.
- Each entry is linked to a bank account; the balance decreases automatically.
- A transaction record is created automatically on save.
- Budget actuals include Loan EMI and Investment payments.

#### Budget
- Create a monthly budget per category: Household, Transport, Food & Personal, Health & Emergency, Loans & Financial, Family/Religious/Social, Savings & Investments, Other.
- Navigate between months using **← Previous** / **Next →** buttons.
- Budgeted vs Actual comparison table per category.
- Want / Need / Save allocation breakdown with percentage guidance (50 % needs · 30 % wants · 20 % savings).
- Budget pie chart.
- Budgets are stored per month in `YYYY-MM` format.

#### Savings & Investments

| Type | Key Fields | Auto-calculation |
|---|---|---|
| **FD** | Principal, rate, tenure, start date | Maturity amount (simple interest), maturity date |
| **RD** | Monthly contribution, rate, tenure | Maturity amount, maturity date |
| **PPF** | Bank/post office, as-of balance, rate | Balance tracked via contributions |
| **SSA** | Bank/post office, as-of balance, rate | Balance tracked via contributions |
| **NPS** | Provider, monthly contribution, return rate | Balance tracked via contributions |
| **Demat** | Stock name, sector, qty, purchase price, current price | P&L per lot, average price |
| **Other Saving** | Name, provider, current value | Manual |

- Demat supports multiple purchase lots per stock. Buying the same stock again adds a new lot and recalculates average price and P&L automatically.
- Sector breakdown pie chart for Demat holdings.
- Sortable data tables with expandable detail rows.
- FD/RD maturity reminders created automatically.
- Inline contribution history on investment cards (same as Loan payment history).
- Contribution history tracked for PPF, SSA, NPS, RD.
- Insurance policies (Term, Health, Vehicle) with premium payment tracking.

#### GoldVault 🪙
- Add gold holdings with name, purity (18K / 22K / 24K), weight (grams), and purchase rate.
- Add market rate entries (date, K18, K22, K24 rates).
- Current value = weight × current market rate for the matching purity.
- Gain/loss vs purchase price shown per holding.

#### Loans 🏦
- Add Personal Loan, Home Loan, Car Loan, Gold Loan, and other loan types.
- Outstanding balance calculated using reducing-balance EMI formula.
- `manualOutstanding` field overrides the calculated balance when set.
- Settled loans show ₹0 outstanding and are excluded from liabilities.
- Loan EMI due date reminders created automatically.
- Gold Loans use direct principal reduction (no EMI logic).

#### Banks & Accounts 🏛️
- Add Savings, Current, FD, RD, PPF, SSA, NPS, Demat, Post Office Savings accounts.
- Account number stored as a string — leading zeros are preserved.
- Copy account number to clipboard.
- Account balance calculated dynamically from opening balance and all linked transactions.
- Account statuses: Active, Inactive, Closed.
- Multiple account holders supported (`holderPersonIds` array).

#### Transactions 🔄
- Unified ledger of all financial movements (income, expense, transfer, investment, loan payment, etc.).
- Paginated sortable table with search and date-range filter.
- CSV export.
- Loan EMI payments split principal and interest — only the interest portion creates an expense record.
- Bank-to-bank transfers do not change net worth.

---

### FamilyVault — Documents & People

Accessed via the **📁 Family** bottom nav tab.

#### People
- Add family members: name, relationship, household, date of birth, gender, status (Active / Inactive).
- Age displayed as **X Years, Y Months, Z Days** calculated from DOB.
- Birthday reminders created automatically for Active members with a DOB.
- Inline "Quick Add Household" within the Add/Edit Person form.
- Relationship order tracked for Child and Member roles.

#### Households
- Add households with name, description, and multi-line address.
- Copy address to clipboard.
- Households cannot be deleted while members or documents are linked to them.

#### Vehicles 🚗
- Add vehicles: type (Car, Bike, Scooter, Commercial, Other), nickname, registration number, make, model, year, owner, chassis number, engine number, notes.
- Vehicles with linked insurance records cannot be deleted until the insurance is removed first.

#### Documents 📄
- Add documents linked to a **Person** or **Household**.
- Supported types: Aadhaar, PAN, Passport, Driving Licence, Ration Card, Insurance, Education, Employment, Property, Vehicle, Certificate, Other.
- Fields: title, type, category, document number (masked by default with show/hide toggle), issue date, expiry date, notes, file attachment.
- File stored as a Blob in IndexedDB (up to 25 MB per file in the browser; Android APK uses native file storage).
- Documents expiring within 30 days are flagged — count shown in the stats bar.
- **Preview** — images shown inline; PDFs in an iframe; other formats offered for download.
- **Open in New Tab** — opens the file in a new browser tab.
- **Share** — uses the Web Share API on supported devices; falls back to download.
- **Details** — shows all metadata with masked document number and show/hide toggle.
- **Search** — filters documents, people, households, and vehicles simultaneously.
- Paginated document table with sortable columns.

---

### PasswordVault — Encrypted Passwords

Accessed via the **🔑 Passwords** bottom nav tab.

- All entries encrypted with **AES-GCM 256-bit** using a PBKDF2-derived key (150,000 iterations, SHA-256) from the user's Vault PIN.
- **Lock / Unlock** — vault is locked by default; correct PIN required to view entries.
- **Add Password** — service name, username/email, password, URL, category, favourite flag, notes.
- **Edit / Delete** password entries.
- **Copy password** to clipboard (one click).
- **Show / Hide** password toggle per entry.
- **Search** — filters by service name, username, URL, or category.
- **Password Generator** — generates a 20-character strong random password and copies it to clipboard.
- **Auto-lock** — configurable (Off, 1 min, 5 min, 15 min); also locks on tab visibility change.
- The lock button (🔒) in the header is only visible when on the PasswordVault section.

---

### Reminders — Bell Panel

Reminders are accessed via the **🔔 bell icon** in the header — available from every screen. There is no separate Reminders navigation tab.

#### Reminder Types

| Type | Created by |
|---|---|
| Manual | User via the bell panel "+ Add Reminder" form |
| Loan due | Auto-created when a loan is saved |
| Insurance renewal | Auto-created when an insurance policy is saved |
| FD / RD maturity | Auto-created when an FD or RD is saved |
| Birthday | Auto-created for every Active family member with a DOB |

#### Bell Panel Features
- **Badge** — red count badge on the bell icon shows the number of pending reminders.
- **Pending reminders** listed first, sorted soonest first.
- **Completed reminders** listed below, sorted most-recently-completed first.
- Each row shows: date & time, priority icon (❗ High · 🟠 Medium · 🟢 Normal), title.
- **Overdue** reminders shown with a red left border and red date text.
- **Birthday** reminders shown with a 🎂 icon and gold left border.
- **Complete** (✅) — marks a reminder done; badge count decreases.
- **Snooze** (😴) — postpone by 10 minutes, 1 hour, or tomorrow (same time).
- **Edit** — tap the title or date to open the edit modal. Birthday reminders show an informational toast instead.
- **Delete** — available inside the edit modal.
- **Pagination** — 5 / 10 / 25 rows per page.
- **Notifications** — browser Notification API on desktop; native Android AlarmManager notifications in the APK (fire even when the app is closed).
- **Yearly repeat** — birthday reminders automatically advance to the next year after firing.

#### Reminder Schema
```json
{
  "id": "uuid",
  "title": "Reminder title",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "priority": "Normal | Medium | High",
  "description": "Optional details",
  "completed": false,
  "repeat": "yearly",
  "source": "birthday",
  "personId": "uuid"
}
```

---

### Settings

Accessed via the **⚙ Settings** bottom nav tab.

#### Profile
- Set display name and preferred currency (INR, USD, EUR, GBP).
- Name appears in the Home welcome message and header.

#### Security
- **Vault PIN** — 4–12 digit numeric PIN. Secures PasswordVault entries.
  - Changing the PIN requires entering the current PIN first.
  - PIN stored as a SHA-256 hash; never stored in plaintext.
- **Auto-lock** — Off / 1 min / 5 min / 15 min.
- **PIN visibility toggle** (👁️) on the PIN input field.

#### Notifications & Reminders
- **Enable Notifications** — requests browser Notification permission (desktop) or Android notification permission (APK).
- **Fix Battery Optimization** — Android only; requests `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` exemption so reminders fire reliably when the app is closed.
- Status text shows current permission state.

#### Backup & Restore
- **Export VaultOne JSON** — downloads a complete JSON snapshot of all data including encrypted password records and document file bytes (base64-encoded).
- **Import JSON** — restores from a previously exported JSON file. Merges all stores.

#### JSON Device File
- **Link JSON File** — links a local `.json` file via the File System Access API (where supported) for direct save without a download prompt.
- **Save to Linked JSON** — writes the current snapshot directly to the linked file.

#### Diagnostics
- **Run Self-Test** — runs 8 built-in checks (see [Self-Test](#self-test)).

#### Activity Log
- Paginated table (Date & Time / Type / Details) of all actions taken across the app.
- Sorted newest first.

#### Clear All Data
- Permanently deletes the VaultOne IndexedDB database, all documents, and all encrypted password records.
- Requires confirmation.

---

## Data Storage

VaultOne uses **IndexedDB** (`VaultOneDB`, version 7) with the following object stores:

| Store | Contents |
|---|---|
| `meta` | App settings, schema version, Web App URL |
| `income` | Income transactions |
| `expenses` | Expense transactions |
| `budgets` | Monthly budget records |
| `investments` | FD, RD, PPF, SSA, NPS, Demat, Other savings |
| `gold` | Gold holdings |
| `goldRates` | Gold market rate entries |
| `loans` | Loan records |
| `banks` | Bank and investment accounts |
| `transactions` | Unified transaction ledger |
| `persons` | Family members |
| `households` | Household records |
| `documents` | Document metadata + file blobs |
| `passwords` | Encrypted password entries |
| `reminders` | All reminder records |
| `activity` | Activity log entries |
| `institutions` | Financial institutions |
| `vehicles` | Vehicle records |
| `insurances` | Insurance policy records |

### Fallback Storage
If IndexedDB is unavailable (e.g. certain browser contexts), VaultOne automatically switches to a `localStorage`-based compatibility mode. Documents up to 3 MB can be stored in this mode. A toast notification informs the user when fallback mode is active.

---

## Backup & Restore

- **Export** — Settings → Backup & Restore → **Export VaultOne JSON**
  - Produces a `.json` file named `VaultOne_Backup_YYYY-MM-DD.json`
  - Contains all stores, settings, and base64-encoded document files
  - Encrypted password records are included (still encrypted — PIN required to decrypt)
- **Import** — Settings → Backup & Restore → **Import JSON**
  - Accepts a previously exported VaultOne JSON file
  - Restores all records; existing data is overwritten per record ID

---

## Security

| Mechanism | Detail |
|---|---|
| Password encryption | AES-GCM 256-bit |
| Key derivation | PBKDF2, 150,000 iterations, SHA-256, random 16-byte salt per entry |
| PIN storage | SHA-256 hash only — plaintext PIN never stored |
| PIN change | Requires current PIN verification before accepting new PIN |
| Auto-lock | Configurable timeout; also triggers on browser tab hide |
| Data isolation | All data stays on-device; no network requests except optional Sheets sync |
| Clear data | Requires explicit user confirmation |

---

## Google Sheets Sync Backend

VaultOne includes an optional Apps Script backend that syncs all data to a private Google Sheet you own. No third-party server is involved — the sheet lives in your own Google account.

### Architecture

| File | Role |
|---|---|
| `src/Code.gs` | Apps Script web app — full CRUD for all 17 stores |
| `src/api.js` | Dual-write bridge — IndexedDB first, Sheets in background |
| `src/config.js` | Runtime config — pre-set `WEB_APP_URL` for APK builds |
| `src/config.template.js` | Template to copy to `config.js` |
| `src/test.html` | Browser-based backend test runner — 36 tests, no IndexedDB |
| `scripts/setup-google-sheets.js` | Interactive Node.js setup helper (see below) |

### Automated Setup (recommended)

Run the setup helper — it opens your browser at the right moments, copies `Code.gs` to your clipboard, and writes the `/exec` URL directly into `src/config.js`:

```bash
node scripts/setup-google-sheets.js
```

### Manual Setup (one-time)

1. Create a new Google Sheet in your Google account.
2. Open **Extensions → Apps Script** and paste the contents of `src/Code.gs`.
3. Run `setupSheets()` once — creates all 17 sheet tabs with styled headers.
4. **Deploy → New deployment → Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the `/exec` URL.
6. In VaultOne, open **Settings → Google Sheets Backup** and paste the URL.

After any `Code.gs` change: **Deploy → Manage deployments → pencil → New version → Deploy**. The `/exec` URL stays the same.

### How the Dual-Write Layer Works

- **Reads** always come from IndexedDB (instant, offline-capable).
- **Writes** go to IndexedDB first (immediate), then fire a background POST to Sheets.
- On first load per session, if a Sheets URL is configured, data is pulled from Sheets → IndexedDB (hydration).
- The Web App URL is stored in both `localStorage` and the IndexedDB `meta` store so it survives cache clears.
- Failed Sheets writes show a non-blocking toast — local data is never lost.

### Data Stores (17 sheets)

`Income` · `Expenses` · `Budgets` · `Investments` · `Loans` · `CashWallets` · `Persons` · `Households` · `Vehicles` · `Documents` · `Passwords` · `Reminders` · `Notes` · `ActivityLog` · `_Meta_iVault` · `_Meta_FamilyVault` · `_Meta_PasswordVault`

### Key Behaviours

- All requests use **POST body** (`Content-Type: text/plain`) — survives the Apps Script `/exec` redirect chain that strips GET query params.
- `_toObjByHeader` / `_toRowByHeader` always read the **actual sheet header row** for column mapping — safe against columns added at different times.
- Google Sheets auto-parses `YYYY-MM` budget months and `YYYY-MM-DD` dates as Date objects — `Code.gs` strips the `T00:00:00Z` suffix on read.
- The `completed` field (Reminders) is normalised from Sheets string `"true"`/`"false"` back to a JS boolean.
- JSON columns (`payments`, `categories`, `movements`, `contributions`, `valueUpdates`) are serialised as strings in the sheet and deserialised on read.
- Retries automatically on `404` / `5xx` / body-lost-on-redirect (up to 2 retries, 800 ms apart).

### Backend Test Runner

Open `src/test.html` in any browser, paste your `/exec` URL, and click **Run All Tests**.

- 36 tests: positive CRUD for all 17 stores + negative / edge-case tests
- No IndexedDB, no app UI — tests the Apps Script backend directly via POST
- 500 ms throttle between calls + auto-retry on `404` / `5xx` / body-lost-on-redirect
- Triage panel on failures: Step · Expected · Received · Root cause

---

## Android APK Build

The APK is built and published to GitHub Releases automatically on every push to `main` via `build-vaultone.yml`. No manual build steps or pre-existing Android project are required.

### Build Stack

| Component | Version |
|---|---|
| Java | 17 (Temurin) |
| Gradle | 8.7 |
| Android Gradle Plugin | 8.6.1 |
| Compile / Target SDK | 35 (Android 15) |
| Min SDK | 24 (Android 7.0) |

### What the Workflow Does

1. Checks out the repository and validates all required `src/` files.
2. Generates a complete Android project in-memory (no committed Android project).
3. Resizes `assets/VaultOne.png` to all mipmap densities using Pillow.
4. Copies all modular web files into `app/src/main/assets/`.
5. Decodes the release keystore from `vaultone-release.jks.b64` and signs the APK.
6. Compiles and packages a **signed release APK**.
7. Uploads `VaultOne.apk` as a GitHub Actions artifact.
8. Creates a GitHub Release tagged `build-{versionCode}` with release notes from `data/release_notes.json` and attaches the APK.

### JavaScript Bridge (`window.VaultOneAndroid`)

| Method | Purpose |
|---|---|
| `scheduleReminderNotification(id, title, description, whenMs)` | Schedule a system notification via AlarmManager |
| `cancelReminderNotification(id)` | Cancel a previously scheduled notification |
| `hasNotificationPermission()` | Check if notification permission is granted |
| `requestNotificationPermission()` | Request Android notification permission |
| `isIgnoringBatteryOptimizations()` | Check battery optimization exemption status |
| `requestIgnoreBatteryOptimizations()` | Open system dialog to request exemption |
| `saveExport(data, fileName)` | Save JSON or PDF to the native Downloads folder |

VaultOne detects the bridge automatically and uses native paths where available, falling back to browser APIs otherwise.

### Auto-Update

On every launch the APK checks the GitHub Releases API for a newer build. If one is found, a dialog prompts the user to download and install it directly within the app.

---

## Self-Test

Run from **Settings → Diagnostics → Run Self-Test**. All 8 tests must pass on a healthy installation:

```
PASS  Storage available
PASS  CRUD income
PASS  Gold current valuation
PASS  Document binary round-trip
PASS  Password encryption round-trip
PASS  Backup schema
PASS  Vehicle CRUD
PASS  Insurance CRUD
```

---

## QA & Test Suite

### Backend Test Runner (`src/test.html`)

Browser-based test runner that validates the Google Sheets Apps Script backend directly via POST. No IndexedDB, no app UI required.

**Run:** Open `src/test.html` in any browser, paste your `/exec` URL, click **Run All Tests**.

| Section | Tests |
|---|---|
| Connection | ping |
| iVault | Income, Expenses, Budgets, Investments, Loans, CashWallets |
| FamilyVault | Households, Persons, Vehicles, Documents (Person / Vehicle / Household owner) |
| PasswordVault | Passwords |
| Shared | Reminders, Notes, ActivityLog |
| Meta | _Meta_iVault, _Meta_FamilyVault, _Meta_PasswordVault |
| API | bulkPut, getAll, getOne missing id, delOne idempotent |
| Negative | Unknown action, unknown store, missing id, empty store, bulkPut edge cases, boolean normalisation, clearStore |

---

## Project Structure

```
VaultOne/
├── src/
│   ├── index.html                   # App shell / home dashboard (entry point)
│   ├── iVault.html                  # iVault module UI
│   ├── iVault.js                    # iVault module logic
│   ├── FamilyVault.html             # FamilyVault module UI
│   ├── FamilyVault.js               # FamilyVault module logic
│   ├── PasswordVault.html           # PasswordVault module UI
│   ├── PasswordVault.js             # PasswordVault module logic
│   ├── shared.js                    # Shared utilities, IndexedDB, nav
│   ├── shared.css                   # Global styles
│   ├── api.js                       # Dual-write bridge (IndexedDB + Google Sheets)
│   ├── config.js                    # Runtime config (WEB_APP_URL)
│   ├── config.template.js           # Template — copy to config.js and set URL
│   ├── Code.gs                      # Apps Script backend (paste into Google Sheet)
│   ├── test.html                    # Backend test runner (36 tests)
│   ├── sw.js                        # Service worker (offline cache)
│   └── jspdf.umd.min.js             # PDF export library
├── assets/
│   └── VaultOne.png                 # App icon
├── data/
│   ├── vaultone_seed.json           # Seed data format template
│   └── release_notes.json           # Release history
├── scripts/
│   └── setup-google-sheets.js       # Interactive Google Sheets setup helper
├── .github/
│   └── workflows/
│       ├── build-vaultone.yml       # Android APK CI build + GitHub Release
│       └── deploy-pages.yml         # GitHub Pages deployment
├── vaultone-release.jks             # Android release keystore
├── vaultone-release.jks.b64         # Base64-encoded keystore (used by CI)
├── .gitignore
└── README.md
```

---

## Release History

### v2.83 — Sprint 6: Google Sheets Cloud Sync Backend *(2025-07-14)*

- New: `Code.gs` — Apps Script web app backend for all 17 data stores
- New: `api.js` — dual-write bridge (IndexedDB first, Sheets in background)
- New: `test.html` — browser-based backend test runner with 36 tests, no IndexedDB dependency
- New: `scripts/setup-google-sheets.js` — interactive Node.js setup helper
- `Code.gs`: `_toObjByHeader` / `_toRowByHeader` always use actual sheet header — never rely on COLS index order
- `Code.gs`: Date suffix stripping for Sheets auto-parsed date columns
- `Code.gs`: Boolean normalisation for `completed` field (`"true"`/`"false"` → JS boolean)
- `Code.gs`: JSON column serialisation for `payments`, `categories`, `movements`, `contributions`, `valueUpdates`
- `Code.gs`: `setupSheets`, `resetAndRebuildSheets`, `reorderSheetColumns` one-time setup helpers
- `api.js`: POST body instead of GET query-string — survives Apps Script `/exec` redirect chain
- `api.js`: `Content-Type: text/plain` avoids CORS preflight on cross-origin POST
- `api.js`: Session hydration — pulls Sheets → IndexedDB once per session
- `api.js`: Web App URL persisted to both `localStorage` and IndexedDB `meta` store
- `test.html`: 500 ms throttle + retry on `404`/`5xx`/body-lost-on-redirect
- `test.html`: `TriageError` class with Step / Expected / Received / Root cause panel

### v2.82 — Sprint 4 & 5: Mobile Application Versioning

- VO-11: Budget actuals now include Loan EMI and Investment payments
- VO-12: Inline contribution history on investment cards
- VO-13: Fixed expense save crash from launcher FAB (db guard + DB version mismatch)
- VO-14: App version shown in footer with live release notes modal (fetched from GitHub Releases)
- VO-15: CI/CD pipeline — APK build + GitHub Release published on every push to `main`
- VO-15: Signed release APK (keystore stored as base64 in repo, decoded at build time)
- VO-15: Auto-update check in APK — prompts user to install newer build from GitHub Releases
- Fix: Cash wallet subcategory dropdown race condition resolved

---

*VaultOne v2.83 · Offline-first · Optional Google Sheets sync · Schema v7 · All data stays on your device.*
