// Broadcast subsystem manages active websocket clients and fan-out delivery.
const { WebSocket } = require("ws");
const logger = require("./logger");
const { createStrokeCommitMessage } = require("./messageProtocol");

const clients = new Set();

function addClient(ws) {
  clients.add(ws);
}

function removeClient(ws) {
  clients.delete(ws);
}

function getClientCount() {
  return clients.size;
}

function broadcastStroke(stroke) {
  const payload = createStrokeCommitMessage(stroke);
  let delivered = 0;
  let removed = 0;

  for (const client of clients) {
    if (client.readyState !== WebSocket.OPEN) {
      clients.delete(client);
      removed += 1;
      continue;
    }

    try {
      client.send(payload);
      delivered += 1;
    } catch (err) {
      clients.delete(client);
      removed += 1;
      logger.warn("Failed to send stroke to a client; removing socket", { error: err.message });
    }
  }

  logger.info(`Broadcasting to ${delivered} clients`, { removedDeadConnections: removed });
}

module.exports = {
  addClient,
  removeClient,
  getClientCount,
  broadcastStroke,
};
