# Cue — Agent Memory

## What this is
A Claude Code `PostToolUse` hook that watches the live session JSONL and fires a single
plain-text nudge (cache hit rate, context compounding, model misrouting) every ~20 tool
calls. Silent otherwise. Full spec lives in `Cue_CLAUDE.md` in this directory — read that
first, it's the source of truth for signals/thresholds/output format.

## Stack & layout
- Plain Node.js (CommonJS, no deps), `package.json` bin: `cue` → `cli/index.js`, `cue-hook` → `hook/index.js`
- `lib/` — parser.js, signals.js, state.js, formatter.js (all built)
- `hook/index.js` — PostToolUse entry point (built)
- `cli/index.js` — install / uninstall / status (built)
- `config/defaults.js` — threshold defaults (built; no `~/.cue/config.json` override loading yet)
- Still open: README with a real nudge screenshot, npm publish

## Run / build / test
- `node -e "const p = require('./lib/parser'); console.log(p.parseSession('<path>'))"`
- Real test files: `~/.claude/projects/<project-slug>/<session-id>.jsonl`
- CLI testing: set `CUE_SETTINGS_PATH=<scratch-file>` before running `node cli/index.js install|uninstall|status` — never run install/uninstall against the real `~/.claude/settings.json` in a dev/test loop.

## Decisions
- 2026-07-16: Cumulative session cost ("Spent so far") is tracked in state.js (cumulative_cost_usd + last_processed_uuid), not recomputed from the parser's 8KB tail window each time — the parser can't see the whole session, only recent turns, so per-hook-call cost deltas are added to a running total, deduped by each turn's uuid (added to parser output) so overlapping tail-window reads never double-count the same turn. "Projected" cost is a naive linear extrapolation: (cumulative_cost / elapsed_minutes) * 60, capped once the session has already run past 60 min — a rough first-pass heuristic, not precise, matching the spec's "~$Y" approximation.
- 2026-07-16: hook/index.js emits nudges as `{"systemMessage": "..."}` JSON on stdout (exit 0), not plain console.log text — verified against Claude Code's own hook docs that plain stdout on PostToolUse only reaches the debug log, never the user-visible transcript, unless the JSON systemMessage field is used.
- 2026-07-16: signals.js Signal 2 (context compounding) tracks cache_read+cache_creation+input per turn, not the literal `input_tokens` field from the spec's pseudocode — real input_tokens sits at 1-4 tokens/turn regardless of context size, so it can't detect growth; total context size is what actually compounds and drives cost.
- 2026-07-16: `parser.js` reads only the last 8KB (default, configurable) of the session
  file via `fs.statSync` + `fs.readSync` at an offset, never a full-file parse — matches
  the spec's "fast, no full parse needed" requirement since hook fires every 20 tool calls.
- 2026-07-16: Parser output is restricted to `model` + the four `usage` token fields only
  — never message content — per the spec's hard privacy rule ("No prompt content... Never
  read actual prompt text or response content").

## Learnings
- 2026-07-16: cli/index.js reads/writes ~/.claude/settings.json — a real, potentially shared file with other tools' hooks (e.g. cmux). Tested install/uninstall exclusively via a CUE_SETTINGS_PATH env var override pointing at a scratch file; never ran `cue install` against the developer's real settings.json, since that would actually register the PostToolUse hook globally. Production code defaults to the real path when the env var is unset — only test invocations should set it.
- 2026-07-16: PostToolUse hook stdin carries `session_id` and `transcript_path` (the exact JSONL file path) — no need to reconstruct the path from project-slug + cwd. `tool_output` is the correct field name for the tool result (not `tool_response`, which appears in some stale third-party writeups). Confirmed against the official Claude Code hooks docs (code.claude.com/docs/en/hooks).
- 2026-07-16: state.js round-trips through ~/.cue/session-state.json because the hook is a fresh Node process per tool call (no in-memory state survives between calls) — test it by shelling out one `node -e` per simulated tool call, not by calling functions in a loop within one process, or you'll miss bugs in the load/save boundary.
- 2026-07-16: When reading only the tail N bytes of a JSONL file, the first line of that
  slice is almost always a partial JSON object (cut off mid-line by the byte offset) — it
  must be discarded (`lines.shift()`), not JSON.parse'd, or every tail read throws/skips
  silently on line 1. Only skip the shift when the read started at byte 0 (whole file).
- 2026-07-16: An empty result array from `parseSession` on a real file isn't necessarily a
  bug — verified against a carescribe session where the last 8KB/32KB were all
  mode/permission-mode bookkeeping events with zero assistant turns. Check `grep -c
  '"type":"assistant"'` on the file before assuming the parser is broken.
