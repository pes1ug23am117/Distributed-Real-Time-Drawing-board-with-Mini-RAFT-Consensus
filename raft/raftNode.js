// raft/raftNode.js
const { rpcCall } = require('./rpcClient');
const { log } = require('./logger');

const HEARTBEAT_INTERVAL = 150;       // ms — leader sends heartbeat this often
const ELECTION_TIMEOUT_MIN = 500;     // ms
const ELECTION_TIMEOUT_MAX = 800;     // ms

class RaftNode {
  constructor(nodeId, peers) {
    // nodeId: e.g. "replica1"
    // peers: array of { id, host, port } for the OTHER two replicas

    this.nodeId = nodeId;
    this.peers = peers;           // [{id, host, port}, ...]

    // --- Persistent state (in real RAFT you'd write these to disk) ---
    this.currentTerm = 0;         // latest term this node has seen
    this.votedFor = null;         // who we voted for in currentTerm
    this.log = [];                // [{term, index, entry}] — the stroke log

    // --- Volatile state ---
    this.commitIndex = -1;        // highest log entry known to be committed
    this.lastApplied = -1;        // highest log entry applied to state machine

    // --- Node state ---
    this.state = 'follower';      // 'follower' | 'candidate' | 'leader'
    this.leaderId = null;         // who we think the current leader is
    this.votes = new Set();       // votes received in current election

    // --- Timers ---
    this.electionTimer = null;
    this.heartbeatTimer = null;

    // --- Callback: called when an entry is committed ---
    // Your Gateway/replica server.js will set this to broadcast the stroke
    this.onCommit = null;

    this._resetElectionTimer();

    log(this.nodeId, 'INFO', `Node started`, { term: this.currentTerm, state: this.state });
  }

  // ─────────────────────────────────────────────
  // TIMER MANAGEMENT
  // ─────────────────────────────────────────────

  _randomTimeout() {
    return ELECTION_TIMEOUT_MIN + Math.random() * (ELECTION_TIMEOUT_MAX - ELECTION_TIMEOUT_MIN);
  }

  _resetElectionTimer() {
    clearTimeout(this.electionTimer);
    this.electionTimer = setTimeout(() => this._startElection(), this._randomTimeout());
  }

  _startHeartbeatTimer() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => this._sendHeartbeats(), HEARTBEAT_INTERVAL);
  }

  _stopHeartbeatTimer() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  // ─────────────────────────────────────────────
  // ELECTION
  // ─────────────────────────────────────────────

  _startElection() {
    if (this.state === 'leader') return;

    this.state = 'candidate';
    this.currentTerm += 1;
    this.votedFor = this.nodeId;   // vote for yourself
    this._voteCount = 1;  

    log(this.nodeId, 'VOTE', `Starting election`, { term: this.currentTerm });

    this._resetElectionTimer();    // reset in case election times out too

    const lastLogIndex = this.log.length - 1;
    const lastLogTerm  = lastLogIndex >= 0 ? this.log[lastLogIndex].term : -1;

    const voteRequest = {
      term: this.currentTerm,
      candidateId: this.nodeId,
      lastLogIndex,
      lastLogTerm,
    };

    // Ask all peers for a vote (fire and forget, handle responses)
    for (const peer of this.peers) {
      rpcCall(peer.host, peer.port, '/request-vote', voteRequest)
        .then(res => this._handleVoteResponse(res))
        .catch(() => {}); // peer might be down — that's fine
    }
  }

  _handleVoteResponse({ term, voteGranted }) {
    if (term > this.currentTerm) {
      this._becomeFollower(term);
      return;
    }
    if (this.state !== 'candidate' || term !== this.currentTerm) return;
    if (voteGranted) {
      this._voteCount++;
      log(this.nodeId, 'VOTE', `Got vote ${this._voteCount}/3`);
      if (this._voteCount >= 2) this._becomeLeader();
    }
  }

  // ─────────────────────────────────────────────
  // STATE TRANSITIONS
  // ─────────────────────────────────────────────

  _becomeFollower(term) {
    log(this.nodeId, 'INFO', `Becoming follower`, { term });
    this.state = 'follower';
    this.currentTerm = term;
    this.votedFor = null;
    this._voteCount = 0;
    this._stopHeartbeatTimer();
    this._resetElectionTimer();
  }

  _becomeLeader() {
    if (this.state !== 'candidate') return;
    log(this.nodeId, 'INFO', `Became LEADER 🎉`, { term: this.currentTerm });
    this.state = 'leader';
    this.leaderId = this.nodeId;
    clearTimeout(this.electionTimer);   // leaders don't time out
    this._startHeartbeatTimer();
    this._sendHeartbeats();             // send immediately
  }

  // ─────────────────────────────────────────────
  // LEADER: HEARTBEATS
  // ─────────────────────────────────────────────

  _sendHeartbeats() {
    if (this.state !== 'leader') return;

    for (const peer of this.peers) {
      const heartbeatMsg = {
        term: this.currentTerm,
        leaderId: this.nodeId,
        commitIndex: this.commitIndex,
      };
      rpcCall(peer.host, peer.port, '/heartbeat', heartbeatMsg)
        .then(res => {
          if (res.term > this.currentTerm) this._becomeFollower(res.term);
        })
        .catch(() => {});
    }
  }

  // ─────────────────────────────────────────────
  // LEADER: LOG REPLICATION
  // ─────────────────────────────────────────────

  async proposeEntry(entry) {
    if (this.state !== 'leader') {
      throw new Error(`Not the leader. Current leader: ${this.leaderId}`);
    }
  
    const logEntry = {
      term: this.currentTerm,
      index: this.log.length,
      entry,
    };
  
    this.log.push(logEntry);
    log(this.nodeId, 'INFO', `Appended to log`, { index: logEntry.index });
  
    const acks = await this._replicateEntry(logEntry);
    log(this.nodeId, 'INFO', `Got ${acks} acks from peers`);
  
    if (acks + 1 >= 2) {  // +1 for self
      this.commitIndex = logEntry.index;
      this.lastApplied = logEntry.index;
      log(this.nodeId, 'COMMIT', `Committed entry`, { index: logEntry.index });
      if (this.onCommit) this.onCommit(logEntry);
      return { success: true, index: logEntry.index };
    }
  
    throw new Error('Failed to get majority acknowledgment');
  }
  
  async _replicateEntry(logEntry) {
    const results = await Promise.allSettled(
      this.peers.map(peer => this._replicateToPeer(peer, logEntry))
    );

    let acks = 0;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const peerResult = result.value;
        if (peerResult.higherTerm > this.currentTerm) {
          this._becomeFollower(peerResult.higherTerm);
          return 0;
        }

        if (peerResult.success) {
          acks++;
          log(this.nodeId, 'INFO', `ACK from peer`, { acks });
        }
      }
    }
    return acks;
  }

  async _replicateToPeer(peer, logEntry) {
    const prevIndex = logEntry.index - 1;
    const prevTerm = prevIndex >= 0 ? this.log[prevIndex].term : -1;

    const appendMsg = {
      term: this.currentTerm,
      leaderId: this.nodeId,
      prevLogIndex: prevIndex,
      prevLogTerm: prevTerm,
      entry: logEntry,
      leaderCommit: this.commitIndex,
    };

    try {
      const res = await rpcCall(peer.host, peer.port, '/append-entries', appendMsg);

      if (res.term > this.currentTerm) {
        return { success: false, higherTerm: res.term };
      }

      if (res.success) {
        return { success: true, higherTerm: null };
      }

      // If follower is behind, backfill entries from the follower's reported length.
      if (Number.isInteger(res.logLength) && res.logLength >= 0 && res.logLength < this.log.length) {
        return this._syncPeerFromIndex(peer, res.logLength);
      }
    } catch (_err) {
      // peer may be down; handled by caller via reduced ack count
    }

    return { success: false, higherTerm: null };
  }

  async _syncPeerFromIndex(peer, fromIndex) {
    for (let idx = fromIndex; idx < this.log.length; idx++) {
      const entry = this.log[idx];
      const prevIndex = idx - 1;
      const prevTerm = prevIndex >= 0 ? this.log[prevIndex].term : -1;

      const appendMsg = {
        term: this.currentTerm,
        leaderId: this.nodeId,
        prevLogIndex: prevIndex,
        prevLogTerm: prevTerm,
        entry,
        leaderCommit: this.commitIndex,
      };

      try {
        const res = await rpcCall(peer.host, peer.port, '/append-entries', appendMsg);

        if (res.term > this.currentTerm) {
          return { success: false, higherTerm: res.term };
        }

        if (!res.success) {
          return { success: false, higherTerm: null };
        }
      } catch (_err) {
        return { success: false, higherTerm: null };
      }
    }

    return { success: true, higherTerm: null };
  }

  // ─────────────────────────────────────────────
  // RPC HANDLERS — these are called by server.js
  // when HTTP requests arrive
  // ─────────────────────────────────────────────

  // POST /request-vote
  handleRequestVote({ term, candidateId, lastLogIndex, lastLogTerm }) {
    // If candidate has a lower term, reject
    if (term < this.currentTerm) {
      return { term: this.currentTerm, voteGranted: false };
    }

    // If higher term, update ourselves
    if (term > this.currentTerm) {
      this._becomeFollower(term);
    }

    // Check if we already voted for someone else this term
    const alreadyVoted = this.votedFor && this.votedFor !== candidateId;

    // Check log is at least as up-to-date as ours
    const myLastIndex = this.log.length - 1;
    const myLastTerm  = myLastIndex >= 0 ? this.log[myLastIndex].term : -1;
    const logOk = (lastLogTerm > myLastTerm) ||
                  (lastLogTerm === myLastTerm && lastLogIndex >= myLastIndex);

    if (!alreadyVoted && logOk) {
      this.votedFor = candidateId;
      this._resetElectionTimer();  // we heard from someone, reset timer
      log(this.nodeId, 'VOTE', `Granted vote to ${candidateId}`, { term });
      return { term: this.currentTerm, voteGranted: true };
    }

    return { term: this.currentTerm, voteGranted: false };
  }

  // POST /append-entries
  handleAppendEntries({ term, leaderId, prevLogIndex, prevLogTerm, entry, leaderCommit }) {
    // Reject old leaders
    if (term < this.currentTerm) {
      return { term: this.currentTerm, success: false, logLength: this.log.length };
    }

    // Valid leader — reset election timer
    if (term > this.currentTerm) this._becomeFollower(term);
    this.leaderId = leaderId;
    this._resetElectionTimer();

    // Log consistency check
    if (prevLogIndex >= 0) {
      const prevEntry = this.log[prevLogIndex];
      if (!prevEntry || prevEntry.term !== prevLogTerm) {
        // Log mismatch — tell leader how much we have so it can sync us
        return { term: this.currentTerm, success: false, logLength: this.log.length };
      }
    }

    // Append the entry (overwrite any conflicting entries)
    if (entry) {
      this.log[entry.index] = entry;
      this.log.length = entry.index + 1; // truncate any stale tail
    }

    // Advance commit index
    if (leaderCommit > this.commitIndex) {
      this.commitIndex = Math.min(leaderCommit, this.log.length - 1);
      if (this.onCommit) this.onCommit(this.log[this.commitIndex]);
    }

    log(this.nodeId, 'INFO', `AppendEntries OK from ${leaderId}`);
    return { term: this.currentTerm, success: true, logLength: this.log.length };
  }

  // POST /heartbeat
  handleHeartbeat({ term, leaderId, commitIndex }) {
    if (term < this.currentTerm) {
      return { term: this.currentTerm, success: false };
    }
    if (term > this.currentTerm) this._becomeFollower(term);

    this.leaderId = leaderId;
    this.state = 'follower';  // a real leader is alive, stay follower
    this._resetElectionTimer();

    log(this.nodeId, 'HEARTBEAT', `Heartbeat from ${leaderId}`, { term });
    return { term: this.currentTerm, success: true };
  }

  // POST /sync-log  — leader sends missing entries to a catching-up follower
  handleSyncLog({ fromIndex }) {
    // Send all committed entries from fromIndex onward
    const missing = this.log.slice(fromIndex).filter(e => e.index <= this.commitIndex);
    log(this.nodeId, 'INFO', `Sync-log request`, { fromIndex, sending: missing.length });
    return { entries: missing, commitIndex: this.commitIndex };
  }

  // Called by a restarted follower on itself to catch up
  async catchUp() {
    if (!this.leaderId || this.leaderId === this.nodeId) return;

    const leader = this.peers.find(p => p.id === this.leaderId);
    if (!leader) return;

    try {
      const { entries, commitIndex } = await rpcCall(
        leader.host, leader.port, '/sync-log', { fromIndex: this.log.length }
      );
      for (const entry of entries) {
        this.log[entry.index] = entry;
      }
      this.commitIndex = commitIndex;
      log(this.nodeId, 'INFO', `Caught up`, { entries: entries.length, commitIndex });
    } catch (e) {
      log(this.nodeId, 'ERROR', `Catch-up failed: ${e.message}`);
    }
  }

  // Useful for Gateway to know who to forward strokes to
  getStatus() {
    return {
      nodeId:      this.nodeId,
      state:       this.state,
      term:        this.currentTerm,
      leaderId:    this.leaderId,
      logLength:   this.log.length,
      commitIndex: this.commitIndex,
    };
  }
}

module.exports = { RaftNode };