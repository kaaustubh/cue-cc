#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

// An absolute `node <script>` invocation, not the bare `cue-hook` bin name —
// the hook fires from whatever shell/PATH Claude Code uses, which may not
// include the npm global bin dir (confirmed on this machine: npm link put
// cue-hook in a Cellar bin path absent from the user's PATH). An absolute
// path works regardless of PATH, npm-link, or install method.
const HOOK_SCRIPT = path.join(__dirname, '..', 'hook', 'index.js');
const HOOK_COMMAND = `node "${HOOK_SCRIPT}"`;
const CUE_DIR = path.join(os.homedir(), '.cue');

// Overridable so tests never touch the developer's real Claude Code
// settings — production always falls through to the real path.
function settingsPath() {
  return process.env.CUE_SETTINGS_PATH || path.join(os.homedir(), '.claude', 'settings.json');
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  const target = settingsPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(settings, null, 2) + '\n');
}

function isInstalled(settings) {
  const entries = settings.hooks?.PostToolUse ?? [];
  return entries.some((entry) => (entry.hooks ?? []).some((h) => h.command === HOOK_COMMAND));
}

function install() {
  const settings = readSettings();

  if (isInstalled(settings)) {
    console.log('Cue is already installed.');
  } else {
    settings.hooks = settings.hooks ?? {};
    settings.hooks.PostToolUse = settings.hooks.PostToolUse ?? [];
    settings.hooks.PostToolUse.push({
      matcher: '*',
      hooks: [{ type: 'command', command: HOOK_COMMAND }],
    });
    writeSettings(settings);
    console.log(`Added Cue's PostToolUse hook to ${settingsPath()}`);
  }

  fs.mkdirSync(CUE_DIR, { recursive: true });
  console.log('Cue is installed. It stays silent until your session needs a nudge (~every 20 tool calls).');
}

function uninstall() {
  const settings = readSettings();

  if (!isInstalled(settings)) {
    console.log('Cue is not installed.');
    return;
  }

  settings.hooks.PostToolUse = settings.hooks.PostToolUse
    .map((entry) => ({ ...entry, hooks: (entry.hooks ?? []).filter((h) => h.command !== HOOK_COMMAND) }))
    .filter((entry) => entry.hooks.length > 0);

  if (settings.hooks.PostToolUse.length === 0) delete settings.hooks.PostToolUse;
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

  writeSettings(settings);
  console.log(`Removed Cue's hook from ${settingsPath()}`);
  console.log('~/.cue/ config left intact — reinstall anytime with `cue install`.');
}

function status() {
  const settings = readSettings();
  console.log(`Hook installed: ${isInstalled(settings) ? 'yes' : 'no'}`);
  console.log(`Settings file:  ${settingsPath()}`);

  const statePath = path.join(CUE_DIR, 'session-state.json');
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    console.log('No active session state found.');
    return;
  }

  console.log(`Active session: ${state.session_id}`);
  console.log(`Tool calls this session: ${state.tool_call_count}`);
  console.log(`Cumulative cost: ~$${state.cumulative_cost_usd.toFixed(2)}`);
  console.log(`Last nudge: ${state.last_nudge_type ?? 'none yet'}`);
}

function main() {
  const command = process.argv[2];

  switch (command) {
    case 'install':
      install();
      break;
    case 'uninstall':
      uninstall();
      break;
    case 'status':
      status();
      break;
    default:
      console.log('Usage: cue <install|uninstall|status>');
      process.exitCode = 1;
  }
}

main();
