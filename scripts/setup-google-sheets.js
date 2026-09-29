#!/usr/bin/env node
/**
 * VaultOne — Google Sheets Sync Setup Helper
 *
 * Usage:  node scripts/setup-google-sheets.js
 *
 * Guides you through the one-time Google Sheets backend setup:
 *   1. Opens Google Sheets in your browser
 *   2. Copies Code.gs to your clipboard
 *   3. Walks you through Apps Script deployment
 *   4. Writes the /exec URL into src/config.js
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const { execSync, exec } = require('child_process');

const ROOT      = path.resolve(__dirname, '..');
const CODE_GS   = path.join(ROOT, 'src', 'Code.gs');
const CONFIG_JS = path.join(ROOT, 'src', 'config.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

function openUrl(url) {
  const cmd = process.platform === 'win32'  ? `start "" "${url}"` :
              process.platform === 'darwin' ? `open "${url}"` :
                                              `xdg-open "${url}"`;
  exec(cmd);
}

function copyToClipboard(text) {
  try {
    if (process.platform === 'win32') {
      const tmp = path.join(require('os').tmpdir(), '_vaultone_code_gs.txt');
      fs.writeFileSync(tmp, text, 'utf8');
      execSync(`clip < "${tmp}"`);
      fs.unlinkSync(tmp);
    } else if (process.platform === 'darwin') {
      execSync('pbcopy', { input: text });
    } else {
      execSync('xclip -selection clipboard', { input: text });
    }
    return true;
  } catch {
    return false;
  }
}

function writeWebAppUrl(url) {
  fs.writeFileSync(CONFIG_JS,
`// VaultOne — runtime configuration
// Injected into the Android APK as an asset alongside the other src/ files.
// Override VAULTONE_CONFIG before the app boots to pre-configure the Web App URL.
window.VAULTONE_CONFIG = window.VAULTONE_CONFIG || {
  WEB_APP_URL: '${url}'
};
`, 'utf8');
}

function validateExecUrl(url) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(url.trim());
}

function hr()             { console.log('\n' + '─'.repeat(60) + '\n'); }
function step(n, t, msg)  { console.log(`\n[${n}/${t}] ${msg}`); }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   VaultOne — Google Sheets Sync Setup        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('\nThis script walks you through the one-time setup.');
  console.log('It will open your browser at the right moments.\n');

  const T = 5;

  // Step 1 ── Create Google Sheet
  step(1, T, 'Create a new Google Sheet');
  console.log('  Opening Google Sheets in your browser...');
  openUrl('https://sheets.new');
  console.log('  → Give the sheet any name (e.g. "VaultOne Sync").');
  await ask('  Press Enter once the sheet is open and named...');

  // Step 2 ── Paste Code.gs
  hr();
  step(2, T, 'Open Apps Script and paste Code.gs');
  const copied = copyToClipboard(fs.readFileSync(CODE_GS, 'utf8'));
  console.log(copied
    ? '  ✔ Code.gs copied to clipboard.'
    : `  ✘ Auto-copy failed — copy the file manually:\n    ${CODE_GS}`
  );
  console.log('\n  In your Google Sheet:');
  console.log('    1. Click  Extensions → Apps Script');
  console.log('    2. Delete all existing code in the editor');
  console.log('    3. Paste  (Ctrl+V / Cmd+V)');
  console.log('    4. Save   (Ctrl+S / Cmd+S)');
  await ask('  Press Enter once you have saved the script...');

  // Step 3 ── Run setupSheets()
  hr();
  step(3, T, 'Run setupSheets()');
  console.log('  In the Apps Script editor:');
  console.log('    1. Select  setupSheets  from the function dropdown');
  console.log('    2. Click  ▶ Run');
  console.log('    3. Authorize when prompted → Review permissions → Allow');
  console.log('    4. Wait for "Execution completed" in the log panel');
  await ask('  Press Enter once setupSheets() has finished successfully...');

  // Step 4 ── Deploy as Web App
  hr();
  step(4, T, 'Deploy as Web App');
  console.log('  In the Apps Script editor:');
  console.log('    1. Click  Deploy → New deployment');
  console.log('    2. Click the gear ⚙ next to "Select type" → Web App');
  console.log('    3. Set:');
  console.log('         Execute as     →  Me');
  console.log('         Who has access →  Anyone');
  console.log('    4. Click  Deploy  and authorize if prompted');
  console.log('    5. Copy the Web App URL  (ends with /exec)');
  await ask('  Press Enter once you have the /exec URL ready...');

  // Step 5 ── Save URL
  hr();
  step(5, T, 'Save the Web App URL');
  let execUrl = '';
  while (true) {
    execUrl = (await ask('  Paste your /exec URL here: ')).trim();
    if (validateExecUrl(execUrl)) break;
    console.log('  ✘ Invalid URL. It should start with:');
    console.log('    https://script.google.com/macros/s/');
  }
  writeWebAppUrl(execUrl);
  console.log('  ✔ URL saved to src/config.js');

  // Done
  hr();
  console.log('✅  Setup complete!\n');
  console.log('  Open VaultOne → Settings → Web App URL to verify the connection.');
  console.log('  To run the backend test suite: open src/test.html → Run All Tests.\n');

  rl.close();
}

main().catch(err => {
  console.error('\n✘ Setup failed:', err.message);
  rl.close();
  process.exit(1);
});
