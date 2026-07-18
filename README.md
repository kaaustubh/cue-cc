# Cue

A Claude Code hook that watches your active session in real time and steps in
with exactly one specific action when something is actually worth saying.

Not a dashboard. Not a CLI report. Not something you run — something that
runs quietly in the background and stays out of your way until it has
something useful to tell you.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ CUE — 22 min into session
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Spent so far:  ~$1.84  |  Projected: ~$4.20

⚠  Cache hit rate: 31% (target >50%)
   CLAUDE.md may have changed since last session.
   Run /compact to reset context cleanly.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Every existing token tool (ccusage, Token Dashboard, Tokenomics) is
retrospective — you check them after the fact. Cue is the real-time,
in-session nudge nobody else does: it reads your live session data every ~20
tool calls and says something only when it's worth interrupting you for.

## Install

```sh
npm install -g cue-cc
cue install
```

`cue install` adds a `PostToolUse` hook to `~/.claude/settings.json` and
creates `~/.cue/` for local state. It only ever touches its own hook entry —
anything else already in your settings file is left alone.

## What it watches

Cue tracks exactly three signals, and only ever surfaces the single
highest-priority one that's currently triggered:

1. **Cache hit rate** — warns when it drops below 50% after the first turn,
   the highest-leverage thing to catch (a stale `CLAUDE.md` or a broken cache
   means you're repaying full context every turn).
2. **Context compounding** — warns when the context Claude reads per turn has
   grown more than 2x over the last 5 turns, the usual reason a session
   quietly costs 3-4x more than expected.
3. **Model misrouting** — warns when recent Opus calls are producing short
   output (<400 tokens), a sign the task didn't need Opus.

A healthy session never hears from Cue. No noise, no "just checking in."

## Design rules

- One signal per nudge, never two warnings at once.
- One action per nudge — a specific command, not a menu of options.
- Never blocks — prints between tool calls, never delays a response.
- Never reads prompt or response content — only token usage metadata.
- Won't repeat the same nudge within 10 tool calls of the last one.

## CLI

```sh
cue install     # add the hook + create ~/.cue/
cue uninstall   # remove only Cue's hook entry; leaves ~/.cue/ intact
cue status      # installed state + current session's tool-call count and cost
```

## Scope

Cue complements retrospective tools like ccusage — it's the real-time
intervention layer, not a replacement for historical cost reporting. It
doesn't store history beyond the current session's lightweight state file,
and it makes no API calls of any kind.

## License

MIT
