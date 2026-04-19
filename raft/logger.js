// raft/logger.js
const colors = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

function log(nodeId, level, msg, data = '') {
  const time = new Date().toISOString().slice(11, 23);
  const color = { INFO: colors.cyan, VOTE: colors.yellow, COMMIT: colors.green, ERROR: colors.red, HEARTBEAT: colors.gray }[level] || colors.reset;
  const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
  console.log(`${color}[${time}] [${nodeId}] [${level}] ${msg}${dataStr}${colors.reset}`);
}

module.exports = { log };