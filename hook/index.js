#!/usr/bin/env node
const fs = require('fs');

const parser = require('../lib/parser');
const signals = require('../lib/signals');
const state = require('../lib/state');
const formatter = require('../lib/formatter');
const config = require('../config').load();

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  const raw = readStdin();

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return; // malformed hook input — fail silent, never block the tool call
  }

  const { session_id: sessionId, transcript_path: transcriptPath } = input;
  if (!sessionId || !transcriptPath) return;

  let s = state.loadState(sessionId);
  s = state.incrementToolCall(s);

  if (!state.shouldAnalyze(s, config.tool_call_interval)) {
    state.saveState(s);
    return;
  }

  let turns;
  try {
    turns = parser.parseSession(transcriptPath);
  } catch {
    state.saveState(s);
    return;
  }

  // Accumulate cost for turns not yet counted, regardless of whether a
  // signal fires this cycle — the running total must stay accurate even on
  // silent (healthy) checks.
  const newTurns = state.newTurnsSince(turns, s.last_processed_uuid);
  if (newTurns.length > 0) {
    const addedCost = formatter.sumCost(newTurns);
    const newLastUuid = newTurns[newTurns.length - 1].uuid;
    s = state.recordCost(s, addedCost, newLastUuid);
  }

  const signal = signals.detectAll(turns, config);
  if (!signal) {
    state.saveState(s);
    return;
  }

  if (state.shouldSuppressNudge(s, signal.type, config.nudge_cooldown_turns)) {
    state.saveState(s);
    return;
  }

  const minutesIn = (Date.now() - s.session_start_ms) / 60_000;
  const projectedUsd = formatter.projectCost(s.cumulative_cost_usd, s.session_start_ms);
  const nudge = formatter.formatNudge({
    signal,
    minutesIn,
    spentUsd: s.cumulative_cost_usd,
    projectedUsd,
  });

  s = state.recordNudge(s, signal.type);
  state.saveState(s);

  process.stdout.write(JSON.stringify({ systemMessage: nudge }));
}

main();
