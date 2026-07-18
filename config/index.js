const fs = require('fs');
const path = require('path');
const os = require('os');

const defaults = require('./defaults');

const CONFIG_PATH = path.join(os.homedir(), '.cue', 'config.json');

// ~/.cue/config.json is optional, user-hand-edited input — a real system
// boundary. Missing file or corrupt JSON just falls back to defaults; any
// override key is only accepted if it matches the expected type of the
// corresponding default, so a typo'd or malformed value (e.g. a string
// where a threshold number is expected) is silently ignored rather than
// breaking the signal math downstream.
function load() {
  let overrides;
  try {
    overrides = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    overrides = {};
  }

  const merged = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (typeof overrides[key] === typeof defaults[key]) {
      merged[key] = overrides[key];
    }
  }
  return merged;
}

module.exports = { load, CONFIG_PATH };
