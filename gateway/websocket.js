// WebSocket server wiring for browser clients and stroke ingestion.
const { WebSocketServer } = require("ws");
const logger = require("./logger");
const { safeParseJson, validateStrokeMessage, createErrorMessage } = require("./messageProtocol");
const { addClient, removeClient, getClientCount } = require("./broadcast");

let socketCounter = 0;

function setupWebSocketServer({ httpServer, onStrokeReceived }) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws) => {
    const socketId = ++socketCounter;
    addClient(ws);
    logger.info(`Client connected: socketId=${socketId}`, { activeClients: getClientCount() });

    ws.on("message", async (rawMessage) => {
      const messageText = typeof rawMessage === "string" ? rawMessage : rawMessage.toString("utf8");
      const parsed = safeParseJson(messageText);
      if (!parsed.ok) {
        ws.send(createErrorMessage("invalid_json", "Message is not valid JSON"));
        return;
      }

      const valid = validateStrokeMessage(parsed.value);
      if (!valid.ok) {
        ws.send(createErrorMessage("invalid_message", valid.error));
        return;
      }

      try {
        await onStrokeReceived(valid.stroke);
      } catch (err) {
        logger.error("Failed to process stroke message", {
          socketId,
          error: err.message,
        });
        ws.send(createErrorMessage("stroke_processing_failed", "Unable to process stroke right now"));
      }
    });

    ws.on("close", () => {
      removeClient(ws);
      logger.info(`Client disconnected: socketId=${socketId}`, { activeClients: getClientCount() });
    });

    ws.on("error", (err) => {
      logger.warn("Client socket error", {
        socketId,
        error: err.message,
      });
    });
  });

  return wss;
}

module.exports = {
  setupWebSocketServer,
};
