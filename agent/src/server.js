import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import {
  listServers, getServer, saveServer, deleteServer, listHistory,
} from "./config.js";
import { listRemote, deleteRemote, renameRemote, mkdirRemote, testConnection, disconnect } from "./ssh.js";
import { listLocal, deleteLocal, renameLocal, mkdirLocal, homeInfo } from "./local.js";
import { startTransfer, listTransfers, cancelTransfer, subscribeAll, subscribe } from "./rsync.js";

const PORT = Number(process.env.PORT) || 8787;
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
app.post("/api/remote/:serverId/mkdir", async (req) => mkdirRemote(req.params.serverId, req.body.path));
app.post("/api/remote/:serverId/rename", async (req) => renameRemote(req.params.serverId, req.body.from, req.body.to));
app.post("/api/remote/:serverId/delete", async (req) => deleteRemote(req.params.serverId, req.body.path));

// Transfers
app.get("/api/transfers", async () => listTransfers());
app.post("/api/transfers", async (req) => startTransfer(req.body));
app.post("/api/transfers/:id/cancel", async (req) => ({ ok: cancelTransfer(req.params.id) }));

// History
app.get("/api/history", async () => listHistory());

// WebSocket for live transfer progress
app.register(async (fastify) => {
  fastify.get("/ws", { websocket: true }, (socket) => {
    const perTransfer = new Map();
    const send = (obj) => {
      try { socket.send(JSON.stringify(obj)); } catch {}
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

app.listen({ port: PORT, host: "127.0.0.1" })
  .then(() => {
    console.log(`\n  SSH Bridge Agent running`);
    console.log(`  → http://127.0.0.1:${PORT}`);
    console.log(`  → Config stored in ~/.ssh-bridge/\n`);
  })
  .catch((e) => { console.error(e); process.exit(1); });
