# SSH Bridge

A premium desktop-web GUI for **SSH + rsync** file operations. Browse remote servers, drag & drop files between local and remote, and watch transfers happen in real time — no terminal required.

![architecture](https://img.shields.io/badge/stack-React_·_TanStack_Start_·_Fastify_·_ssh2_·_rsync-blue)

## Architecture

```
┌─────────────────────────┐          HTTP + WS           ┌──────────────────────────┐
│   Web UI  (this repo)   │  ──────────────────────────► │  Local Agent  (agent/)   │
│  React + TanStack Start │        127.0.0.1:8787        │  Fastify + ssh2 + rsync  │
└─────────────────────────┘                              └────────────┬─────────────┘
                                                                      │
                                                             SSH / SFTP / rsync
                                                                      ▼
                                                              Your remote servers
```

The web UI runs in your browser. All actual SSH connections and rsync processes run inside the **local Node.js agent** on your own machine, so nothing sensitive ever leaves localhost.

## Requirements

- **Node.js 18+**
- **rsync** installed (macOS/Linux: pre-installed; Windows: use WSL)
- **ssh** client on your `PATH`

## Quick start

Open two terminals in the project root.

**Terminal 1 — start the local agent** (this is what actually talks to servers):
```bash
cd agent
npm install
npm start
# → Listening on http://127.0.0.1:8787
```

**Terminal 2 — start the web UI**:
```bash
npm install
npm run dev
# → Open the printed URL
```

That's it. Add a server from the sidebar, test the connection, then drag files between the local and remote panels.

## Features

- **SSH connection manager** with password or key-based auth (paste key or reference `~/.ssh/id_rsa`)
- **Encrypted credential storage** — AES-256-GCM, key stored at `~/.ssh-bridge/key` with `0600` perms
- **Split-pane file explorer** — local (via Node fs) and remote (via SFTP)
- **Drag & drop transfers** between panels; single-click quick upload/download
- **Real-time progress** streamed over WebSocket from `rsync --info=progress2`
- **Multi-server** — switch between servers instantly from the sidebar or top bar
- **Transfer history** persisted to `~/.ssh-bridge/servers.json`

## Data & security

- Server credentials, history, and known-hosts live in `~/.ssh-bridge/`.
- Passwords and private keys are encrypted at rest and **never returned** to the browser.
- The agent binds to `127.0.0.1` only. It is not exposed on your network.
- Recommended: use SSH keys. Password auth for rsync requires `sshpass` on your system.

## Project structure

```
.
├── agent/                    # Local Node.js companion
│   ├── src/
│   │   ├── server.js         # Fastify HTTP + WS server
│   │   ├── config.js         # Encrypted config store
│   │   ├── ssh.js            # SFTP browsing + connection pool
│   │   ├── rsync.js          # rsync process runner with progress parsing
│   │   └── local.js          # Local filesystem helpers
│   └── package.json
└── src/                      # React web UI (TanStack Start + Tailwind v4)
    ├── routes/index.tsx      # Main dashboard
    ├── components/
    │   ├── ServerSidebar.tsx
    │   ├── FileExplorer.tsx
    │   ├── TransferPanel.tsx
    │   ├── ServerDialog.tsx
    │   ├── TopBar.tsx
    │   └── AgentOfflineBanner.tsx
    ├── hooks/                # useServers, useTransfers, useAgentStatus
    └── lib/agent.ts          # Typed client for the local agent
```

## Configuration

The web UI defaults to `http://127.0.0.1:8787`. Override with:

```bash
VITE_AGENT_URL=http://127.0.0.1:9000 npm run dev
```

## License

MIT
