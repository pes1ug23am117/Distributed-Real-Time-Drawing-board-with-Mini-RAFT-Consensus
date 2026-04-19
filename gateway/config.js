// Centralized runtime configuration for the Gateway service.
const DEFAULT_REPLICAS = {
  replica1: "http://localhost:3001",
  replica2: "http://localhost:3002",
  replica3: "http://localhost:3003",
};

const IS_DOCKER = process.env.IS_DOCKER === "true";

function parseReplicaEnv() {
  const fromJson = process.env.REPLICAS_JSON;
  if (!fromJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromJson);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed;
  } catch (_err) {
    return null;
  }
}

const envReplicas = parseReplicaEnv();

function normalizeReplicaUrl(replicaId, candidateUrl) {
  if (!candidateUrl) {
    return DEFAULT_REPLICAS[replicaId];
  }

  // In manual local runs, container DNS names (replica1/replica2/replica3)
  // are not resolvable; fall back to localhost defaults.
  if (!IS_DOCKER) {
    try {
      const parsed = new URL(candidateUrl);
      const containerHostnames = new Set(["replica1", "replica2", "replica3", "gateway"]);
      if (containerHostnames.has(parsed.hostname)) {
        return DEFAULT_REPLICAS[replicaId];
      }
    } catch (_err) {
      return DEFAULT_REPLICAS[replicaId];
    }
  }

  return candidateUrl;
}

const replicas = {
  replica1: normalizeReplicaUrl(
    "replica1",
    process.env.REPLICA1_URL || (envReplicas && envReplicas.replica1) || DEFAULT_REPLICAS.replica1
  ),
  replica2: normalizeReplicaUrl(
    "replica2",
    process.env.REPLICA2_URL || (envReplicas && envReplicas.replica2) || DEFAULT_REPLICAS.replica2
  ),
  replica3: normalizeReplicaUrl(
    "replica3",
    process.env.REPLICA3_URL || (envReplicas && envReplicas.replica3) || DEFAULT_REPLICAS.replica3
  ),
};

const config = {
  gatewayPort: Number(process.env.PORT || process.env.GATEWAY_PORT || 8080),
  host: process.env.GATEWAY_HOST || "0.0.0.0",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 1500),
  healthCheckIntervalMs: Number(process.env.HEALTH_CHECK_INTERVAL_MS || 3000),
  leaderDiscoveryTimeoutMs: Number(process.env.LEADER_DISCOVERY_TIMEOUT_MS || 1200),
  queueFlushBatchSize: Number(process.env.QUEUE_FLUSH_BATCH_SIZE || 100),
  replicas,
};

module.exports = config;
