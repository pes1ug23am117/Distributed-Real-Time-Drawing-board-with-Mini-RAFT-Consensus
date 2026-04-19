# Distributed Real-Time Drawing Board with Mini-RAFT Consensus

This document is the final team handoff and demo reference for the project.

## System in One Sentence

Gateway handles client communication and routing to the current RAFT leader; RAFT replicas handle election, replication, and commit by majority.

## Architecture

Browser Clients -> Gateway -> RAFT Cluster (3 replicas)

## Subsystem Ownership

### Person 1: RAFT Core + Replica Logic

Scope:
- Node states: follower, candidate, leader
- Leader election with random timeout (500-800 ms)
- RPC APIs: `/request-vote`, `/append-entries`, `/heartbeat`, `/sync-log`
- Log replication and commit index updates
- Majority acknowledgment handling
- Catch-up for restarted/outdated nodes
- Term updates and stale leader rejection
- Election/heartbeat/commit logging

Deliverables:
- Shared RAFT module used by all replicas
- Replica servers importing shared RAFT core

### Person 2: Gateway + Real-Time Communication

Scope:
- Accept browser client connections
- Receive stroke events from clients
- Detect current leader
- Forward strokes only to leader
- Handle failover and reroute automatically
- Receive committed strokes from replicas
- Broadcast committed strokes to all connected clients

Deliverables:
- `gateway/` service
- Real-time message protocol
- Client broadcast/fan-out logic

### Person 3: Frontend + DevOps + Docker

Scope:
- Browser canvas drawing UI
- Mouse/touch input to stroke events
- Send strokes to Gateway
- Render remote committed strokes
- Container setup and compose wiring

Deliverables:
- `frontend/` UI
- Docker configuration (`docker-compose.yml`)
- Hot-reload/dev workflow support

## Correct End-to-End Flow

1. User draws on canvas.
2. Client sends stroke to Gateway.
3. Gateway resolves current leader from replica status/leader endpoints.
4. Gateway forwards stroke to leader only.
5. Leader appends log entry and replicates to followers.
6. If majority acks (2 of 3 including leader), leader commits.
7. Replicas notify Gateway on committed entry callback.
8. Gateway broadcasts committed stroke to all clients.
9. Clients render the committed stroke.

## Election Behavior (RAFT-Owned)

- Leader heartbeat interval: 150 ms
- Follower election timeout: random 500-800 ms
- On heartbeat miss: follower -> candidate
- Candidate increments term and requests votes
- Majority winner becomes leader and starts heartbeats
- Gateway does not run elections; it only discovers and reroutes to the current leader

## Failure Behavior

- 3/3 alive: normal operation
- 2/3 alive: normal operation (majority still possible)
- 1/3 alive: no majority, commits fail, Gateway should reject/defer new strokes

## Important Implementation Notes

Use this section for viva/demo accuracy when describing the current codebase:

- The top-level `gateway/` service uses WebSocket for client realtime transport.
- Gateway forwarding path is leader-directed and retry-aware (with queued retries during leader uncertainty).
- Committed-stroke fan-out is callback-driven from replicas to Gateway.
- Gateway does not participate in RAFT voting or term changes.

If you present API shapes, verify against the running stack because this repository contains more than one folder layout and some scaffold code paths differ.

## Suggested Demo Script

1. Start all services.
2. Draw from one browser client and show broadcast to others.
3. Stop current leader container.
4. Show election in replica logs.
5. Show Gateway reroute and continued drawing after failover.
6. Stop a second replica and demonstrate majority-loss behavior.

## Viva Answer (Ready to Say)

The gateway receives drawing events from clients and forwards each event to the current RAFT leader. The leader replicates the event to followers and commits it only after majority acknowledgment. Once committed, the gateway broadcasts the committed stroke to all connected clients. If leader fails, replicas elect a new leader using RAFT timeouts and voting, and the gateway automatically detects and routes to the new leader.

## Railway Deployment (No Compose)

Railway deploys services individually (not via `docker-compose`).

Create one Railway project with 5 services from this same repository:

1. `frontend`
2. `gateway`
3. `replica1`
4. `replica2`
5. `replica3`

Set each service root directory as:

1. frontend -> `frontend/frontend`
2. gateway -> `gateway`
3. replica1 -> `.` (uses `replica1/Dockerfile`)
4. replica2 -> `.` (uses `replica2/Dockerfile`)
5. replica3 -> `.` (uses `replica3/Dockerfile`)

For replica services, explicitly set Dockerfile path in Railway service settings:

1. replica1 -> `replica1/Dockerfile`
2. replica2 -> `replica2/Dockerfile`
3. replica3 -> `replica3/Dockerfile`

Environment variables per service:

### gateway

1. `GATEWAY_HOST=0.0.0.0`
2. `REPLICA1_URL=http://<replica1-private-or-public-url>`
3. `REPLICA2_URL=http://<replica2-private-or-public-url>`
4. `REPLICA3_URL=http://<replica3-private-or-public-url>`

### replica1

1. `NODE_ID=replica1`
2. `GATEWAY_URL=http://<gateway-private-or-public-url>`
3. `PEERS=http://<replica2-private-or-public-url>,http://<replica3-private-or-public-url>`

### replica2

1. `NODE_ID=replica2`
2. `GATEWAY_URL=http://<gateway-private-or-public-url>`
3. `PEERS=http://<replica1-private-or-public-url>,http://<replica3-private-or-public-url>`

### replica3

1. `NODE_ID=replica3`
2. `GATEWAY_URL=http://<gateway-private-or-public-url>`
3. `PEERS=http://<replica1-private-or-public-url>,http://<replica2-private-or-public-url>`

### frontend

1. `GATEWAY_WS_URL=wss://<gateway-public-domain>`

Notes:

1. Railway injects `PORT` automatically. This project now honors `PORT` for gateway and frontend containers.
2. Frontend reads `GATEWAY_WS_URL` at container start; if not set, it falls back to same-host `:8080`.
