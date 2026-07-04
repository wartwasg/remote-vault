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

By default the agent listens on `http://127.0.0.1:8787`.

For access from another computer on the same network, run:

```bash
HOST=0.0.0.0 PUBLIC_HOST=192.168.1.179 npm start
```

Then start the web UI with `npm run dev:lan` from the project root and open `http://192.168.1.179:8080`.
Clients that open the UI from that server IP automatically connect to the agent at `http://192.168.1.179:8787`.

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
