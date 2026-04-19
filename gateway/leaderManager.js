// Leader manager tracks current RAFT leader and performs discovery during failover.
const axios = require("axios");
const logger = require("./logger");

class LeaderManager {
  constructor({ replicas, leaderDiscoveryTimeoutMs }) {
    this.replicas = replicas;
    this.leaderDiscoveryTimeoutMs = leaderDiscoveryTimeoutMs;
    this.currentLeaderId = null;
    this.currentLeaderAddress = null;
    this.discoveryPromise = null;
  }

  getLeader() {
    return {
      leaderId: this.currentLeaderId,
      leaderAddress: this.currentLeaderAddress,
    };
  }

  setLeader(leaderId) {
    const nextAddress = this.replicas[leaderId] || null;
    if (!nextAddress) {
      logger.warn("Attempted to set unknown leader", { leaderId });
      return false;
    }

    const previousLeader = this.currentLeaderId;
    this.currentLeaderId = leaderId;
    this.currentLeaderAddress = nextAddress;

    if (previousLeader !== leaderId) {
      logger.info(`Leader changed ${previousLeader || "none"} -> ${leaderId}`);
    }

    return true;
  }

  updateFromHint(leaderIdHint) {
    if (!leaderIdHint) {
      return false;
    }

    return this.setLeader(leaderIdHint);
  }

  async discoverLeader() {
    if (this.discoveryPromise) {
      return this.discoveryPromise;
    }

    this.discoveryPromise = this._discoverLeaderInternal()
      .finally(() => {
        this.discoveryPromise = null;
      });

    return this.discoveryPromise;
  }

  async _discoverLeaderInternal() {
    const entries = Object.entries(this.replicas);
    let hintedLeaderId = null;

    for (const [replicaId, baseUrl] of entries) {
      try {
        const response = await axios.get(`${baseUrl}/status`, {
          timeout: this.leaderDiscoveryTimeoutMs,
        });

        const status = response && response.data;
        if (!status || typeof status !== "object") {
          continue;
        }

        if (status.state === "leader" && this.replicas[status.nodeId]) {
          this.setLeader(status.nodeId);
          return this.getLeader();
        }

        const leaderId = status.leaderId;
        if (leaderId && this.replicas[leaderId]) {
          hintedLeaderId = leaderId;
        }
      } catch (err) {
        logger.warn("Leader discovery request failed for replica", {
          replicaId,
          error: err.message,
        });
      }
    }

    if (hintedLeaderId && this.replicas[hintedLeaderId]) {
      this.setLeader(hintedLeaderId);
      return this.getLeader();
    }

    logger.warn("Leader discovery did not find a valid leader");
    return this.getLeader();
  }
}

module.exports = LeaderManager;
