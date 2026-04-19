// replica1/server.js
const express = require('express');
const { RaftNode, log } = require('../raft');

const app  = express();
app.use(express.json());

const NODE_ID = process.env.NODE_ID || 'replica1';
const PORT    = parseInt(process.env.PORT) || 3001;
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';

// when running on local host
// const PEERS = [
//   { id: 'replica2', host: 'localhost', port: 3002 },
//   { id: 'replica3', host: 'localhost', port: 3003 },
// ].filter(p => p.id !== NODE_ID);

function parsePeerFromUrl(urlValue, index) {
  try {
    const parsed = new URL(urlValue);
    const fallbackId = `peer${index + 1}`;
    const id = parsed.hostname.split('.')[0] || fallbackId;
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    if (!Number.isFinite(port) || port <= 0) {
      return null;
    }

    return { id, host: parsed.hostname, port };
  } catch (_err) {
    return null;
  }
}

function parsePeersFromEnv() {
  const peerJson = process.env.PEERS_JSON;
  if (peerJson) {
    try {
      const parsed = JSON.parse(peerJson);
      if (Array.isArray(parsed)) {
        const peers = parsed
          .map((item, index) => {
            if (typeof item === 'string') {
              return parsePeerFromUrl(item, index);
            }

            if (item && typeof item === 'object' && item.host && item.port) {
              const id = item.id || String(item.host).split('.')[0] || `peer${index + 1}`;
              const port = Number(item.port);
              if (!Number.isFinite(port) || port <= 0) {
                return null;
              }
              return { id, host: String(item.host), port };
            }

            return null;
          })
          .filter(Boolean);

        if (peers.length > 0) {
          return peers;
        }
      }
    } catch (_err) {
      // ignore invalid JSON and continue with other config sources
    }
  }

  const peerCsv = process.env.PEERS;
  if (!peerCsv) {
    return null;
  }

  const peers = peerCsv
    .split(',')
    .map((item, index) => parsePeerFromUrl(item.trim(), index))
    .filter(Boolean);

  return peers.length > 0 ? peers : null;
}

const IS_DOCKER = process.env.IS_DOCKER === 'true';
const defaultPeers = [
  { id: 'replica2', host: IS_DOCKER ? 'replica2' : 'localhost', port: 3002 },
  { id: 'replica3', host: IS_DOCKER ? 'replica3' : 'localhost', port: 3003 },
];

const PEERS = (parsePeersFromEnv() || defaultPeers).filter(p => p.id !== NODE_ID);

const node = new RaftNode(NODE_ID, PEERS);

// When an entry is committed, tell the Gateway to broadcast it
node.onCommit = (logEntry) => {
  const http = require('http');
  const target = new URL(`${GATEWAY_URL}/committed-stroke`);
  const body = JSON.stringify({ stroke: logEntry.entry });
  const req = http.request({
    hostname: target.hostname,
    port: target.port || 80,
    path: target.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  });
    req.on('error', () => {
      // gateway not running yet — safe to ignore during local testing
    });
  req.write(body); req.end();
};

// ── RPC endpoints (called by other replicas) ──────────────────

app.post('/request-vote',   (req, res) => res.json(node.handleRequestVote(req.body)));
app.post('/append-entries', (req, res) => res.json(node.handleAppendEntries(req.body)));
app.post('/heartbeat',      (req, res) => res.json(node.handleHeartbeat(req.body)));
app.post('/sync-log',       (req, res) => res.json(node.handleSyncLog(req.body)));

// ── Client-facing endpoint (called by Gateway) ────────────────

// Gateway calls this to submit a stroke
app.post('/stroke', async (req, res) => {
  try {
    const result = await node.proposeEntry(req.body);
    res.json(result);
  } catch (e) {
    // If we're not leader, tell Gateway who the leader is
    res.status(302).json({ error: e.message, leaderId: node.leaderId });
  }
});

// Gateway polls this to find the leader
app.get('/status', (req, res) => res.json(node.getStatus()));

app.listen(PORT, () => log(NODE_ID, 'INFO', `Listening on port ${PORT}`));