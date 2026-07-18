const BAR = '━'.repeat(43);

// $ per million tokens. Cache read/write are derived from each model's base
// input rate using Anthropic's standard multipliers (~0.1x read, 1.25x/2x
// write for 5m/1h TTL) since usage fields don't distinguish cache TTL — cache
// creation is priced at the 5m rate, the common case.
const PRICING = {
  'claude-opus-4-8': { input: 5.0, output: 25.0 },
  'claude-sonnet-5': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
};

const DEFAULT_PRICING = PRICING['claude-sonnet-5'];

function pricingFor(model) {
  if (!model) return DEFAULT_PRICING;
  const match = Object.keys(PRICING).find((id) => model.includes(id));
  return match ? PRICING[match] : DEFAULT_PRICING;
}

function costOfTurn(turn) {
  const p = pricingFor(turn.model);
  const cacheRead = p.input * 0.1;
  const cacheWrite5m = p.input * 1.25;

  return (
    (turn.input_tokens * p.input +
      turn.output_tokens * p.output +
      turn.cache_read_input_tokens * cacheRead +
      turn.cache_creation_input_tokens * cacheWrite5m) /
    1_000_000
  );
}

function sumCost(turns) {
  return turns.reduce((total, turn) => total + costOfTurn(turn), 0);
}

// Linear extrapolation: hold the observed $/minute rate steady out to a
// "typical" session length. Once the session has already run past that
// length, there's nothing left to project — the running total is the best
// estimate.
function projectCost(cumulativeCostUsd, sessionStartMs, now = Date.now(), typicalSessionMinutes = 60) {
  const elapsedMinutes = Math.max((now - sessionStartMs) / 60_000, 1 / 60);
  if (elapsedMinutes >= typicalSessionMinutes) return cumulativeCostUsd;

  const ratePerMinute = cumulativeCostUsd / elapsedMinutes;
  return ratePerMinute * typicalSessionMinutes;
}

function formatUsd(amount) {
  return amount < 0.01 ? amount.toFixed(3) : amount.toFixed(2);
}

const SIGNAL_COPY = {
  cache: (s) => ({
    description: `Cache hit rate: ${Math.round(s.hitRate * 100)}% (target >${Math.round(s.threshold * 100)}%)`,
    why: 'CLAUDE.md may have changed since last session.',
    action: 'Run /compact to reset context cleanly.',
  }),
  compounding: (s) => ({
    description: `Context compounding — tokens grew ${s.growth.toFixed(1)}x over the last 5 turns.`,
    why: 'Compounding context is why sessions cost 3-4x more than expected.',
    action: 'Run /compact now to save on remaining turns.',
  }),
  misrouting: (s) => ({
    description: `Last ${s.count} Opus calls averaged ${Math.round(s.avgOutput)} output tokens.`,
    why: 'Sonnet handles tasks this size identically.',
    action: 'Run /model sonnet to switch for this session.',
  }),
};

// The exact 10-line nudge format from the Cue spec. `signal` is whatever
// lib/signals.js#detectAll returned (a {type, ...} object); `minutesIn`,
// `spentUsd`, and `projectedUsd` come from the caller's cost accounting.
function formatNudge({ signal, minutesIn, spentUsd, projectedUsd }) {
  const copy = SIGNAL_COPY[signal.type](signal);

  return [
    BAR,
    `⚡ CUE — ${Math.round(minutesIn)} min into session`,
    BAR,
    `Spent so far:  ~$${formatUsd(spentUsd)}  |  Projected: ~$${formatUsd(projectedUsd)}`,
    '',
    `⚠  ${copy.description}`,
    `   ${copy.why}`,
    `   ${copy.action}`,
    BAR,
  ].join('\n');
}

module.exports = {
  pricingFor,
  costOfTurn,
  sumCost,
  projectCost,
  formatNudge,
};
