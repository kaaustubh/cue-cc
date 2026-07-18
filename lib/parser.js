const fs = require('fs');

const DEFAULT_TAIL_BYTES = 8192;

/**
 * Reads the last `tailBytes` of a Claude Code session JSONL file and
 * returns usage metrics for each assistant turn found in that window.
 *
 * Never reads message content — only message.usage, message.model, and the
 * turn's uuid (an identifier, not content — used by state.js to dedupe cost
 * accounting across overlapping tail reads).
 */
function parseSession(filePath, tailBytes = DEFAULT_TAIL_BYTES) {
  const { size } = fs.statSync(filePath);
  const start = Math.max(0, size - tailBytes);
  const length = size - start;

  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buffer, 0, length, start);
  } finally {
    fs.closeSync(fd);
  }

  const lines = buffer.toString('utf8').split('\n');

  // The tail read starts mid-line unless we happened to land on a
  // newline boundary (or read the whole file), so drop the first
  // fragment — it's a partial JSON object and will fail to parse anyway.
  if (start > 0) {
    lines.shift();
  }

  const turns = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const usage = entry?.message?.usage;
    if (entry.type !== 'assistant' || !usage) continue;

    turns.push({
      uuid: entry.uuid ?? null,
      model: entry.message.model ?? null,
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    });
  }

  return turns;
}

module.exports = { parseSession };
