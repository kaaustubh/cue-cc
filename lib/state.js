const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_DIR = path.join(os.homedir(), '.cue');
const STATE_PATH = path.join(STATE_DIR, 'session-state.json');

function getStatePath() {
  return STATE_PATH;
}

function freshState(sessionId) {
  return {
    session_id: sessionId,
    tool_call_count: 0,
    last_nudge_type: null,
    last_nudge_at_turn: null,
    session_start_ms: Date.now(),
    cumulative_cost_usd: 0,
    last_processed_uuid: null,
  };
}

// The hook is a fresh process per tool call, so state must round-trip through
// disk. A missing file, corrupt JSON, or a session_id that doesn't match the
// one on disk (a new session started) all just mean "start fresh" here.
function loadState(sessionId) {
  let stored;
  try {
    stored = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return freshState(sessionId);
  }

  if (stored.session_id !== sessionId) {
    return freshState(sessionId);
  }

  return stored;
}

function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function incrementToolCall(state) {
  return { ...state, tool_call_count: state.tool_call_count + 1 };
}

function shouldAnalyze(state, interval = 20) {
  return state.tool_call_count > 0 && state.tool_call_count % interval === 0;
}

// "Don't repeat the same nudge within 10 tool calls" — a different signal
// type is always allowed through; only a repeat of the last-shown type is
// subject to the cooldown window.
function shouldSuppressNudge(state, signalType, cooldownTurns = 10) {
  if (state.last_nudge_type !== signalType) return false;
  if (state.last_nudge_at_turn === null) return false;
  return state.tool_call_count - state.last_nudge_at_turn < cooldownTurns;
}

function recordNudge(state, signalType) {
  return {
    ...state,
    last_nudge_type: signalType,
    last_nudge_at_turn: state.tool_call_count,
  };
}

// The parser returns a fixed-size tail window, so the same turn can appear
// in consecutive hook invocations. Turns are chronological (oldest first),
// so everything strictly after the last-processed uuid is new since the
// last check; if that uuid has scrolled out of the window entirely, every
// turn currently visible is new (they're all more recent than it).
function newTurnsSince(turns, lastProcessedUuid) {
  if (lastProcessedUuid === null) return turns;
  const idx = turns.findIndex((t) => t.uuid === lastProcessedUuid);
  return idx === -1 ? turns : turns.slice(idx + 1);
}

function recordCost(state, addedCostUsd, newLastProcessedUuid) {
  return {
    ...state,
    cumulative_cost_usd: state.cumulative_cost_usd + addedCostUsd,
    last_processed_uuid: newLastProcessedUuid ?? state.last_processed_uuid,
  };
}

module.exports = {
  getStatePath,
  loadState,
  saveState,
  incrementToolCall,
  shouldAnalyze,
  shouldSuppressNudge,
  recordNudge,
  newTurnsSince,
  recordCost,
};
