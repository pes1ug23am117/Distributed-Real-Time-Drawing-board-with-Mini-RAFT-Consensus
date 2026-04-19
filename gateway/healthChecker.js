// Periodic health checker monitors replicas and triggers leader rediscovery on failures.
const axios = require("axios");
const logger = require("./logger");

function startHealthChecker({ replicas, leaderManager, intervalMs, requestTimeoutMs, onLeaderHealthy }) {
  const tick = async () => {
    const entries = Object.entries(replicas);
    const currentLeader = leaderManager.getLeader();

    let leaderHealthy = false;

    for (const [replicaId, baseUrl] of entries) {
      try {
        await axios.get(`${baseUrl}/status`, { timeout: requestTimeoutMs });

        if (replicaId === currentLeader.leaderId) {
          leaderHealthy = true;
        }
      } catch (err) {
        logger.warn("Replica failure detected", {
          replicaId,
          error: err.message,
        });
      }
    }

    if (currentLeader.leaderId && !leaderHealthy) {
      logger.warn("Current leader appears unhealthy; trying rediscovery", {
        leaderId: currentLeader.leaderId,
      });
      await leaderManager.discoverLeader();
      if (typeof onLeaderHealthy === "function") {
        await onLeaderHealthy();
      }
      return;
    }

    if (!currentLeader.leaderId) {
      await leaderManager.discoverLeader();
      if (typeof onLeaderHealthy === "function") {
        await onLeaderHealthy();
      }
    }
  };

  const timer = setInterval(() => {
    tick().catch((err) => {
      logger.error("Health check tick failed", { error: err.message });
    });
  }, intervalMs);

  // Run immediately so startup does not wait for the first interval.
  tick().catch((err) => {
    logger.error("Initial health check failed", { error: err.message });
  });

  return () => clearInterval(timer);
}

module.exports = {
  startHealthChecker,
};
