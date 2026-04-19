# Distributed Real-Time Drawing Board with Mini-RAFT Consensus

## Project Report

### 1. Abstract
This project implements a real-time collaborative drawing board backed by a distributed consensus mechanism based on the RAFT algorithm. Multiple users can draw simultaneously through a browser interface, while a Gateway service routes drawing events to the current RAFT leader. The leader replicates events to follower replicas and commits updates only after majority acknowledgment, ensuring consistency and fault tolerance. The system supports leader failure handling, automatic election, and continued operation under single-node failure.

### 2. Problem Statement
Traditional collaborative whiteboards often rely on a single backend service, creating a single point of failure. If that backend fails, the system becomes unavailable or inconsistent.

This project addresses that limitation by:
- Separating client communication and consensus responsibilities.
- Using a Gateway for real-time communication.
- Using a 3-node RAFT cluster for replicated state and fault-tolerant commit.

### 3. Objectives
- Build a real-time collaborative drawing board.
- Maintain consistent committed drawing state across replicas.
- Ensure write operations are accepted only through the leader.
- Support automatic leader election on failure.
- Continue operation when one replica fails.
- Reject/defer commits when majority is not available.

### 4. System Overview
System in one sentence:
Gateway handles client communication and routing to the current RAFT leader; RAFT replicas handle election, replication, and commit by majority.

High-level architecture:
- Browser Clients
- Gateway
- RAFT Cluster (Replica1, Replica2, Replica3)

Data flow summary:
1. Browser sends stroke event to Gateway over WebSocket.
2. Gateway identifies current leader.
3. Gateway forwards stroke to leader.
4. Leader appends and replicates entry.
5. On majority acknowledgment, leader commits.
6. Replica callback notifies Gateway.
7. Gateway broadcasts committed stroke to all connected clients.

### 5. Team-Wise Subsystem Responsibilities

#### 5.1 Person 1: RAFT Core + Replica Logic
Implemented:
- Node states: follower, candidate, leader.
- Election timeout range: 500 to 800 ms.
- Leader heartbeat interval: 150 ms.
- RAFT RPC endpoints:
  - /request-vote
  - /append-entries
  - /heartbeat
  - /sync-log
- Log replication and majority acknowledgment.
- Commit index updates.
- Term update handling and stale leader rejection.
- Catch-up support using sync-log.
- Election/heartbeat/commit logging.

Deliverable achieved:
- Shared RAFT core module imported by replica services.

#### 5.2 Person 2: Gateway + Real-Time Communication
Implemented:
- WebSocket server for client connections.
- Stroke message ingestion and validation.
- Leader discovery and routing logic.
- Health checks for replicas.
- Failover-aware retry and queued forwarding.
- Committed stroke broadcast to all clients.

Deliverable achieved:
- Gateway service with real-time message protocol and broadcast logic.

#### 5.3 Person 3: Frontend + DevOps
Implemented:
- Browser canvas drawing interface.
- Mouse and touch drawing support.
- Stroke event generation and send to Gateway.
- Rendering of received remote committed strokes.
- Multi-tab real-time collaborative behavior.

Partial/Deferred:
- Docker deployment unification and final compose cleanup planned for later.

### 6. Detailed Design

#### 6.1 RAFT Behavior
- Followers expect periodic heartbeats.
- If heartbeat missing for randomized timeout, follower becomes candidate.
- Candidate increments term and requests votes.
- Majority vote elects leader.
- Leader sends heartbeats and handles client proposals.

Commit rule:
- In a 3-node cluster, at least 2 acknowledgments (leader + one follower) are required for commit.

#### 6.2 Gateway Behavior
- Maintains leader hint and discovers leader from replica status.
- Accepts stroke events from WebSocket clients.
- Forwards writes to leader only.
- Handles rerouting when leader changes.
- Broadcasts only committed strokes to clients.

#### 6.3 Frontend Behavior
- Opens persistent WebSocket to Gateway.
- Sends local stroke events.
- Receives committed stroke events and renders them.
- Auto-reconnect behavior keeps UI connected during transient failures.

### 7. Implementation Stack
- Runtime: Node.js
- Backend framework: Express
- Real-time transport: WebSocket (ws)
- Frontend: HTML/CSS/JavaScript canvas
- Language: JavaScript
- Local testing: Multiple terminals + browser tabs

### 8. Integration Challenges and Fixes
During integration of independently developed modules, the following issues were found and resolved:

1. Endpoint mismatch
- Gateway and replicas had different route assumptions.
- Fixed by aligning forwarding and callback routes.

2. Port/config mismatch
- Local vs Docker URL assumptions conflicted.
- Fixed by local-safe defaults and environment gating.

3. Leader discovery mismatch
- Discovery route mismatch between Gateway and replicas.
- Fixed by reading replica status for leader inference.

4. Shared module import path issue
- Replica services referenced RAFT path incorrectly.
- Fixed import path to shared module.

5. WebSocket message compatibility
- Broadcast message type mismatch caused stale-tab issues.
- Fixed message compatibility for reliable multi-tab behavior.

6. Stale process and cache issues
- Old terminal processes and browser cache caused inconsistent behavior.
- Resolved by port cleanup, clean restart, and hard refresh.

### 9. Testing and Validation

#### 9.1 Test Environment
- 4 backend processes (Gateway + 3 replicas).
- 3 browser tabs as separate users.
- Manual and API-based runtime status verification.

#### 9.2 Test Cases

Test Case 1: Normal operation (all replicas alive)
- Action: Draw in User 1 tab.
- Expected: Users 2 and 3 see updates in real time.
- Result: Pass.

Test Case 2: Leader failover
- Action: Stop current leader replica.
- Expected: New leader elected automatically; drawing resumes.
- Result: Pass.

Test Case 3: Majority loss
- Action: Stop two replicas; keep one alive.
- Expected: No new commit possible; writes not committed cluster-wide.
- Result: Pass.

#### 9.3 Observed Properties
- Eventual continuity under single-node failure.
- Leader election and routing recovery without restarting clients.
- Majority-based safety for commit.

### 10. Final Outcome
The project successfully demonstrates:
- Real-time multi-user collaboration.
- Consensus-backed commit with RAFT principles.
- Fault tolerance and automatic leader election.
- Correct behavior under normal, failover, and majority-loss scenarios.

### 11. Limitations
- Frontend currently applies local drawing immediately before commit acknowledgment (optimistic local UX).
- Full reconnect replay/state reconciliation can be improved further.
- Docker deployment path exists but final single-compose production packaging is pending.

### 12. Future Work
- Add committed-state replay API for full reconnect consistency.
- Add persistence (disk-backed log/snapshot).
- Add idempotency and deduplication improvements.
- Complete unified Docker compose and CI pipeline.
- Add automated integration tests.

### 13. Conclusion
This project achieves a practical and demonstrable distributed systems application by combining WebSocket-based real-time interaction with RAFT-based consensus and failover handling. It validates that separating communication (Gateway) and consistency (RAFT cluster) yields a robust architecture for collaborative applications.

### 14. Viva-Ready Summary
The system uses a Gateway to receive drawing events from clients and route them to the current RAFT leader. The leader replicates the event to followers and commits only after majority acknowledgment. Once committed, the Gateway broadcasts the committed stroke to all connected clients. If the leader fails, replicas elect a new leader using RAFT timeouts and voting, and the Gateway automatically reroutes requests to the new leader.

### 15. Run and Test Commands (Local)

Start services in separate PowerShell terminals:

Replica1:
```powershell
Set-Location "C:\Users\Farhan\OneDrive\Desktop\CC_PROJECT\Distributed-Real-Time-Drawing-Board-with-Mini-RAFT-Consensus-gateway\replica1"
npm start
```

Replica2:
```powershell
Set-Location "C:\Users\Farhan\OneDrive\Desktop\CC_PROJECT\Distributed-Real-Time-Drawing-Board-with-Mini-RAFT-Consensus-gateway\replica2"
npm start
```

Replica3:
```powershell
Set-Location "C:\Users\Farhan\OneDrive\Desktop\CC_PROJECT\Distributed-Real-Time-Drawing-Board-with-Mini-RAFT-Consensus-gateway\replica3"
npm start
```

Gateway:
```powershell
Set-Location "C:\Users\Farhan\OneDrive\Desktop\CC_PROJECT\Distributed-Real-Time-Drawing-Board-with-Mini-RAFT-Consensus-gateway\gateway"
npm start
```

Replica status check:
```powershell
$urls='http://localhost:3001/status','http://localhost:3002/status','http://localhost:3003/status'
$urls | % { (Invoke-RestMethod $_) | ConvertTo-Json -Compress }
```

Frontend URL (open in 3 tabs):
```text
http://127.0.0.1:5500/Distributed-Real-Time-Drawing-Board-with-Mini-RAFT-Consensus-gateway/frontend/frontend/index.html
```
