# VaultOne 🔐

**Version:** v1.9 · **Schema:** v7 · **Offline-first · No server · No cloud**

VaultOne is a fully offline, single-file personal vault that runs directly in any modern browser or as a native Android APK. All data is stored locally on the device using IndexedDB. Nothing is ever sent to a server.

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
- [Android APK Build](#android-apk-build)
- [Self-Test](#self-test)
- [Project Structure](#project-structure)

---

## Features at a Glance

| Feature | Detail |
|---|---|
| Offline-first | Works with no internet connection |
| Single HTML file | Open `VaultOne.html` directly in any modern browser |
| IndexedDB storage | Persistent local storage, schema v7 |
| Encrypted passwords | AES-GCM 256-bit, PIN-derived PBKDF2 key |
| Family documents | Aadhaar, PAN, Passport, Driving Licence and more |
| Full finance suite | Income, Expenses, Budget, FD, RD, PPF, SSA, NPS, Demat, Gold, Loans, Banks |
| Reminders | Manual, auto-generated (loan / insurance / investment due dates), birthday reminders |
| Android notifications | Native AlarmManager notifications via JavaScript bridge |
| Responsive | Desktop browsers and Android mobile (390 px – 1280 px+) |
| Export / Import | Full JSON backup and restore |

---

## Getting Started

### Browser

1. Download `VaultOne.html`.
2. Open it in any modern browser (Chrome, Edge, Firefox, Safari).
3. All data is saved automatically to the browser's IndexedDB.

> **Note:** Using a private / incognito window will clear IndexedDB when the window closes. Use a normal browser window for persistent storage.

### Android APK

Download the latest `VaultOne.apk` from the [GitHub Actions artifacts](../../actions/workflows/build-vaultone.yml). The APK is built automatically from `VaultOne.html` on every push to `main` — no separate Android project is needed.

The APK wraps `VaultOne.html` in a WebView and adds:
- Native AlarmManager-based reminder notifications (fire even when the app is closed or the device is idle)
- Battery optimization exemption request for reliable alarm delivery
- Native Downloads folder integration for JSON export
- Native file picker for JSON import

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
| `meta` | App settings, schema version |
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
| Data isolation | All data stays on-device; no network requests |
| Clear data | Requires explicit user confirmation |

---

## Android APK Build

The APK is built automatically on every push to `main` via the `build-vaultone.yml` GitHub Actions workflow. No manual build steps or pre-existing Android project are required.

The workflow:
1. Checks out the repository and locates `VaultOne.html`.
2. Generates a complete Android project in-memory.
3. Compiles and packages a debug APK using Gradle 8.7 / AGP 8.6.1 / Java 17 / Android API 35.
4. Uploads `VaultOne.apk` as a GitHub Actions artifact.

The APK exposes a `window.VaultOneAndroid` JavaScript bridge:

| Method | Purpose |
|---|---|
| `scheduleReminderNotification(id, title, description, whenMs)` | Schedule a system notification via AlarmManager |
| `cancelReminderNotification(id)` | Cancel a previously scheduled notification |
| `hasNotificationPermission()` | Check if notification permission is granted |
| `requestNotificationPermission()` | Request Android notification permission |
| `isIgnoringBatteryOptimizations()` | Check battery optimization exemption status |
| `requestIgnoreBatteryOptimizations()` | Open system dialog to request exemption |

VaultOne detects the bridge automatically and uses native paths where available, falling back to browser APIs otherwise.

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

## Project Structure

```
VaultOne/
├── VaultOne.html          # Main application (v1.9, schema v7)
├── VaultOne.png           # App icon
├── vaultone_seed.json     # Optional seed data for first run
├── .github/
│   └── workflows/
│       └── build-vaultone.yml   # Android APK CI build
└── README.md
```

---

*VaultOne v1.9 · Offline-first · Schema v7 · All data stays on your device.*
