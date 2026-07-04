import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import {
  listServers,
  saveServer,
  deleteServer,
  listHistory,
  listBookmarks,
  saveBookmark,
  deleteBookmark,
  listPresets,
  savePreset,
  deletePreset,
} from "./config.js";
import {
  listRemote,
  deleteRemote,
  renameRemote,
  mkdirRemote,
  testConnection,
  disconnect,
  searchRemote,
  chmodRemote,
  safeDeleteRemote,
  restoreRemote,
  runRemoteCommand,
} from "./ssh.js";
import { listLocal, deleteLocal, renameLocal, mkdirLocal, homeInfo, searchLocal } from "./local.js";
import {
  startTransfer,
  dryRunTransfer,
  listTransfers,
  cancelTransfer,
  subscribe,
} from "./rsync.js";

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_HOST = process.env.PUBLIC_HOST || HOST;
const app = Fastify({ logger: { level: "info" } });

await app.register(cors, { origin: true });
await app.register(websocket);

app.get("/health", async () => ({ ok: true, version: "1.0.0", ...homeInfo() }));

// Servers
app.get("/api/servers", async () => listServers());
app.post("/api/servers", async (req) => saveServer(req.body));
app.delete("/api/servers/:id", async (req) => {
  disconnect(req.params.id);
  deleteServer(req.params.id);
  return { ok: true };
});
app.post("/api/servers/test", async (req) => {
  try {
    await testConnection(req.body);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
app.post("/api/servers/:id/disconnect", async (req) => {
  disconnect(req.params.id);
  return { ok: true };
});

// Local FS
app.get("/api/local/list", async (req) => listLocal(req.query.path));
app.get("/api/local/search", async (req) => searchLocal(req.query.path, req.query.q));
app.post("/api/local/mkdir", async (req) => mkdirLocal(req.body.path));
app.post("/api/local/rename", async (req) => renameLocal(req.body.from, req.body.to));
app.post("/api/local/delete", async (req) => deleteLocal(req.body.path));

// Remote FS
app.get("/api/remote/:serverId/list", async (req) => {
  try {
    return await listRemote(req.params.serverId, req.query.path);
  } catch (e) {
    return { error: e.message, entries: [], path: req.query.path || "." };
  }
});
app.get("/api/remote/:serverId/search", async (req) =>
  searchRemote(req.params.serverId, req.query.path, req.query.q),
);
app.post("/api/remote/:serverId/mkdir", async (req) =>
  mkdirRemote(req.params.serverId, req.body.path),
);
app.post("/api/remote/:serverId/rename", async (req) =>
  renameRemote(req.params.serverId, req.body.from, req.body.to),
);
app.post("/api/remote/:serverId/delete", async (req) =>
  deleteRemote(req.params.serverId, req.body.path),
);
app.post("/api/remote/:serverId/safe-delete", async (req) =>
  safeDeleteRemote(req.params.serverId, req.body.path),
);
app.post("/api/remote/:serverId/restore", async (req) =>
  restoreRemote(req.params.serverId, req.body.from, req.body.to),
);
app.post("/api/remote/:serverId/chmod", async (req) =>
  chmodRemote(req.params.serverId, req.body.path, req.body.mode),
);
app.post("/api/remote/:serverId/terminal", async (req) =>
  runRemoteCommand(req.params.serverId, req.body.cwd, req.body.command),
);

// Transfers
app.get("/api/transfers", async () => listTransfers());
app.post("/api/transfers", async (req) => startTransfer(req.body));
app.post("/api/transfers/dry-run", async (req) => dryRunTransfer(req.body));
app.post("/api/transfers/:id/cancel", async (req) => ({ ok: cancelTransfer(req.params.id) }));

// History
app.get("/api/history", async () => listHistory());
app.post("/api/history/:id/retry", async (req) => {
  const entry = listHistory().find((h) => h.id === req.params.id);
  if (!entry) throw new Error("History entry not found");
  return startTransfer({
    serverId: entry.serverId,
    direction: entry.direction,
    localPath: entry.localPath,
    remotePath: entry.remotePath,
  });
});

// Bookmarks and presets
app.get("/api/bookmarks", async (req) => listBookmarks(req.query.serverId || null));
app.post("/api/bookmarks", async (req) => saveBookmark(req.body));
app.delete("/api/bookmarks/:id", async (req) => ({ ok: deleteBookmark(req.params.id) }));
app.get("/api/presets", async () => listPresets());
app.post("/api/presets", async (req) => savePreset(req.body));
app.delete("/api/presets/:id", async (req) => ({ ok: deletePreset(req.params.id) }));

// WebSocket for live transfer progress
app.register(async (fastify) => {
  fastify.get("/ws", { websocket: true }, (socket) => {
    const perTransfer = new Map();
    const send = (obj) => {
      try {
        socket.send(JSON.stringify(obj));
      } catch {}
    };
    // Push snapshots of all active transfers every second
    const interval = setInterval(() => {
      send({ type: "transfers", transfers: listTransfers() });
    }, 1000);
    send({ type: "transfers", transfers: listTransfers() });

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "subscribe" && msg.transferId) {
          const unsub = subscribe(msg.transferId, (evt) => send({ type: "transfer", ...evt }));
          perTransfer.set(msg.transferId, unsub);
        }
      } catch {}
    });
    socket.on("close", () => {
      clearInterval(interval);
      for (const u of perTransfer.values()) u();
    });
  });
});

app
  .listen({ port: PORT, host: HOST })
  .then(() => {
    console.log(`\n  SSH Bridge Agent running`);
    console.log(`  → http://${PUBLIC_HOST}:${PORT}`);
    console.log(`  → Config stored in ~/.ssh-bridge/\n`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
