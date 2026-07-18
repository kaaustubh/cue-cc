const DEFAULTS = {
  cache_hit_rate_threshold: 0.50,
  context_growth_threshold: 2.0,
  opus_output_token_threshold: 400,
};

function cacheHitRate(turn) {
  const total = turn.cache_read_input_tokens + turn.cache_creation_input_tokens + turn.input_tokens;
  return total === 0 ? 0 : turn.cache_read_input_tokens / total;
}

// cache_read + cache_creation + input approximates the total context Claude
// processed this turn — the quantity that actually compounds turn over turn.
// (The spec's pseudocode names this `input_tokens`, but that field alone is a
// near-constant few tokens per turn and never reflects context growth.)
function contextSize(turn) {
  return turn.cache_read_input_tokens + turn.cache_creation_input_tokens + turn.input_tokens;
}

// Signal 1 — Cache hit rate
function detectCacheWarning(turns, threshold = DEFAULTS.cache_hit_rate_threshold) {
  if (turns.length === 0) return null;

  const latest = turns[turns.length - 1];

  // A turn with no cache_read but nonzero cache_creation is almost always the
  // session's true turn 1 (nothing to read from yet) — spec says "> 70% after
  // turn 1", so skip rather than false-alarm on session start.
  const isLikelyFirstTurn = latest.cache_read_input_tokens === 0 && latest.cache_creation_input_tokens > 0;
  if (isLikelyFirstTurn) return null;

  const hitRate = cacheHitRate(latest);
  if (hitRate < threshold) {
    return { type: 'cache', hitRate, threshold };
  }
  return null;
}

// Signal 2 — Context compounding
function detectCompounding(turns, growthThreshold = DEFAULTS.context_growth_threshold, lookback = 5) {
  if (turns.length <= lookback) return null;

  const latestIdx = turns.length - 1;
  const pastIdx = latestIdx - lookback;
  const past = contextSize(turns[pastIdx]);
  if (past === 0) return null;

  const current = contextSize(turns[latestIdx]);
  const growth = current / past;
  if (growth > growthThreshold) {
    return { type: 'compounding', growth, threshold: growthThreshold, sinceTurn: pastIdx, atTurn: latestIdx };
  }
  return null;
}

// Signal 3 — Model misrouting
function detectMisrouting(turns, outputThreshold = DEFAULTS.opus_output_token_threshold) {
  if (turns.length === 0) return null;

  const lastThree = turns.slice(-3);
  const opusCalls = lastThree.filter((t) => t.model && t.model.includes('opus'));
  if (opusCalls.length < 2) return null;

  const avgOutput = opusCalls.reduce((sum, c) => sum + c.output_tokens, 0) / opusCalls.length;
  if (avgOutput < outputThreshold) {
    return { type: 'misrouting', avgOutput, threshold: outputThreshold, count: opusCalls.length };
  }
  return null;
}

// Priority order: cache > compounding > misrouting. Returns the single
// highest-priority triggered signal, or null when the session is healthy.
function detectAll(turns, config = {}) {
  const cfg = { ...DEFAULTS, ...config };

  return (
    detectCacheWarning(turns, cfg.cache_hit_rate_threshold) ||
    detectCompounding(turns, cfg.context_growth_threshold) ||
    detectMisrouting(turns, cfg.opus_output_token_threshold) ||
    null
  );
}

module.exports = {
  detectAll,
  detectCacheWarning,
  detectCompounding,
  detectMisrouting,
  cacheHitRate,
  contextSize,
};
