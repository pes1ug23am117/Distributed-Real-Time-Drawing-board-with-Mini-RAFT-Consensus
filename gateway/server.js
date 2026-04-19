// Gateway entrypoint: HTTP API + WebSocket bridge to RAFT leader.
const http = require("http");
const express = require("express");

const config = require("./config");
const logger = require("./logger");
const LeaderManager = require("./leaderManager");
const ReplicaClient = require("./replicaClient");
const { setupWebSocketServer } = require("./websocket");
const { broadcastStroke } = require("./broadcast");
const { startHealthChecker } = require("./healthChecker");

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const leaderManager = new LeaderManager({
    replicas: config.replicas,
    leaderDiscoveryTimeoutMs: config.leaderDiscoveryTimeoutMs,
  });

  const replicaClient = new ReplicaClient({
    leaderManager,
    requestTimeoutMs: config.requestTimeoutMs,
    queueFlushBatchSize: config.queueFlushBatchSize,
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "gateway alive" });
  });

  app.post("/committed-stroke", (req, res) => {
    const stroke = req.body && req.body.stroke;
    if (!stroke || typeof stroke !== "object") {
      res.status(400).json({ error: "invalid_committed_stroke_payload" });
      return;
    }

    logger.info("Stroke committed", { strokeId: stroke.id || null });
    broadcastStroke(stroke);
    res.status(200).json({ ok: true });
  });

  app.use((err, _req, res, _next) => {
    logger.error("Unhandled express error", { error: err.message });
    res.status(500).json({ error: "internal_gateway_error" });
  });

  const httpServer = http.createServer(app);

  setupWebSocketServer({
    httpServer,
    onStrokeReceived: async (stroke) => {
      await replicaClient.sendStroke(stroke);
    },
  });

  startHealthChecker({
    replicas: config.replicas,
    leaderManager,
    intervalMs: config.healthCheckIntervalMs,
    requestTimeoutMs: config.requestTimeoutMs,
    onLeaderHealthy: async () => {
      await replicaClient.flushQueue();
    },
  });

  await leaderManager.discoverLeader();
  await replicaClient.flushQueue();

  httpServer.listen(config.gatewayPort, config.host, () => {
    logger.info("Gateway server started", {
      host: config.host,
      port: config.gatewayPort,
      replicas: config.replicas,
      currentLeader: leaderManager.getLeader(),
    });
  });

  const shutdown = (signal) => {
    logger.warn(`Received ${signal}, shutting down gateway`);
    httpServer.close(() => {
      logger.info("Gateway HTTP server closed");
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", { reason: String(reason) });
  });

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", { error: err.message });
  });
}

bootstrap().catch((err) => {
  logger.error("Gateway bootstrap failed", { error: err.message });
  process.exit(1);
});
