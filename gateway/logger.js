// Minimal structured logger so gateway events are easy to trace in distributed logs.
function formatMessage(level, message, meta) {
  const ts = new Date().toISOString();
  const base = `[Gateway] [${ts}] [${level}] ${message}`;

  if (!meta) {
    return base;
  }

  return `${base} ${JSON.stringify(meta)}`;
}

function info(message, meta) {
  console.log(formatMessage("INFO", message, meta));
}

function warn(message, meta) {
  console.warn(formatMessage("WARN", message, meta));
}

function error(message, meta) {
  console.error(formatMessage("ERROR", message, meta));
}

module.exports = {
  info,
  warn,
  error,
};
