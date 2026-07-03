# SSH Bridge Agent

Local companion service that runs on your machine and exposes SSH + rsync operations to the SSH Bridge web UI via HTTP + WebSocket.

## Requirements

- Node.js 18+
- `rsync` installed on your system (macOS/Linux: pre-installed. Windows: use WSL.)
- `ssh` client available on PATH

## Install & Run

```bash
cd agent
npm install
npm start
```

The agent listens on `http://127.0.0.1:8787` (localhost only — never exposed to network).

## Data

- Server configs encrypted with AES-256-GCM using a per-machine key at `~/.ssh-bridge/key`.
- Servers, history, and known_hosts stored under `~/.ssh-bridge/`.
- Passwords and private keys are never returned to the web UI.

## Endpoints

- `GET  /health`
- `GET/POST/DELETE /api/servers`
- `POST /api/servers/test`
- `GET  /api/local/list?path=...`
- `GET  /api/remote/:serverId/list?path=...`
- `POST /api/transfers` — `{ serverId, direction: "upload"|"download", localPath, remotePath }`
- `WS   /ws` — live transfer progress
