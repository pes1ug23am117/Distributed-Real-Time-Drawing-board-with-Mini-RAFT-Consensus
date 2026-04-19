// Replica client forwards strokes to the current leader and handles failover retries.
const axios = require("axios");
const logger = require("./logger");

class ReplicaClient {
  constructor({ leaderManager, requestTimeoutMs, queueFlushBatchSize }) {
    this.leaderManager = leaderManager;
    this.requestTimeoutMs = requestTimeoutMs;
    this.queueFlushBatchSize = queueFlushBatchSize;
    this.pendingStrokeQueue = [];
    this.flushing = false;
  }

  async sendStroke(stroke) {
    logger.info("Stroke received", { strokeId: stroke.id });

    const leader = this.leaderManager.getLeader();
    if (!leader.leaderId || !leader.leaderAddress) {
      logger.warn("No leader known; queueing stroke", { strokeId: stroke.id });
      this.pendingStrokeQueue.push(stroke);
      await this.leaderManager.discoverLeader();
      await this.flushQueue();
      return;
    }

    try {
      await this._postStrokeToLeader(leader.leaderId, leader.leaderAddress, stroke);
    } catch (err) {
      const redirectedLeader = this._extractLeaderHint(err);
      if (redirectedLeader) {
        this.leaderManager.updateFromHint(redirectedLeader);
      }

      logger.warn("Failed to forward stroke to leader, queueing for retry", {
        strokeId: stroke.id,
        error: err.message,
        leaderHint: redirectedLeader || null,
      });

      this.pendingStrokeQueue.push(stroke);
      await this.leaderManager.discoverLeader();
      await this.flushQueue();
    }
  }

  async flushQueue() {
    if (this.flushing) {
      return;
    }

    if (this.pendingStrokeQueue.length === 0) {
      return;
    }

    this.flushing = true;

    try {
      let processedInBatch = 0;

      while (this.pendingStrokeQueue.length > 0 && processedInBatch < this.queueFlushBatchSize) {
        const leader = this.leaderManager.getLeader();
        if (!leader.leaderId || !leader.leaderAddress) {
          logger.warn("Cannot flush queue: no leader available");
          break;
        }

        const stroke = this.pendingStrokeQueue[0];

        try {
          await this._postStrokeToLeader(leader.leaderId, leader.leaderAddress, stroke);
          this.pendingStrokeQueue.shift();
          processedInBatch += 1;
        } catch (err) {
          const redirectedLeader = this._extractLeaderHint(err);
          if (redirectedLeader) {
            this.leaderManager.updateFromHint(redirectedLeader);
          } else {
            await this.leaderManager.discoverLeader();
          }

          logger.warn("Queue flush paused due to leader routing failure", {
            strokeId: stroke.id,
            error: err.message,
          });
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  async _postStrokeToLeader(leaderId, leaderAddress, stroke) {
    logger.info(`Forwarding stroke to leader ${leaderId}`, { strokeId: stroke.id });

    await axios.post(
      `${leaderAddress}/stroke`,
      stroke,
      { timeout: this.requestTimeoutMs }
    );
  }

  _extractLeaderHint(err) {
    const data = err && err.response && err.response.data;
    if (!data || typeof data !== "object") {
      return null;
    }

    if (data.leaderId && typeof data.leaderId === "string") {
      return data.leaderId;
    }

    if (data.leader && typeof data.leader === "string") {
      return data.leader;
    }

    return null;
  }
}

module.exports = ReplicaClient;
