import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { getServer } from "./config.js";
import { addHistory } from "./config.js";

const active = new Map(); // transferId -> { proc, meta }

const DIR = path.join(os.homedir(), ".ssh-bridge");
const ASKPASS_PATH = path.join(DIR, "askpass.sh");

function ensureAskpass() {
  if (!fs.existsSync(DIR)) {
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  }
  if (!fs.existsSync(ASKPASS_PATH)) {
    fs.writeFileSync(ASKPASS_PATH, '#!/bin/sh\necho "$SSH_PASSWORD"\n', { mode: 0o755 });
  }
}

function writeKeyToTemp(privateKey) {
  const p = path.join(os.tmpdir(), `ssh-bridge-${crypto.randomUUID()}.key`);
  fs.writeFileSync(p, privateKey, { mode: 0o600 });
  return p;
}

function makeSshOpts(server) {
  const parts = [
    "ssh",
    "-p", String(server.port || 22),
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "UserKnownHostsFile=" + path.join(os.homedir(), ".ssh-bridge", "known_hosts"),
  ];
  let tmpKey = null;
  if (server.privateKey) {
    tmpKey = writeKeyToTemp(server.privateKey);
    parts.push("-i", tmpKey);
  } else if (server.keyPath) {
    const p = server.keyPath.startsWith("~")
      ? path.join(os.homedir(), server.keyPath.slice(1))
      : server.keyPath;
    parts.push("-i", p);
  }
  return { sshCommand: parts.join(" "), tmpKey };
}

/**
 * direction: "upload" (local -> remote) | "download" (remote -> local)
 */
export function startTransfer({ serverId, direction, localPath, remotePath, options = {} }) {
  const server = getServer(serverId);
  if (!server) throw new Error("Server not found");
  const { sshCommand, tmpKey } = makeSshOpts(server);

  const remoteSpec = `${server.username}@${server.host}:${remotePath}`;
  const src = direction === "upload" ? localPath : remoteSpec;
  const dst = direction === "upload" ? remotePath ? remoteSpec : "" : localPath;

  const args = [
    "-avz",
    "--progress",
    "--partial",
    "--info=progress2,name0",
    "-e", sshCommand,
  ];
  if (options.delete) args.push("--delete");
  if (options.bwlimit) args.push(`--bwlimit=${options.bwlimit}`);
  args.push(src, dst);

  const env = { ...process.env };
  if (server.authType !== "key" && server.password) {
    ensureAskpass();
    env.SSH_ASKPASS = ASKPASS_PATH;
    env.SSH_ASKPASS_REQUIRE = "force";
    env.SSH_PASSWORD = server.password;
    env.DISPLAY = ":0";
  }

  if (!fs.existsSync(DIR)) {
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  }

  const proc = spawn("rsync", args, { env, stdio: ["ignore", "pipe", "pipe"] });
  const transferId = crypto.randomUUID();
  const meta = {
    id: transferId,
    serverId,
    direction,
    localPath,
    remotePath,
    startedAt: Date.now(),
    status: "running",
    progress: 0,
    speed: "",
    transferred: 0,
    total: 0,
    currentFile: "",
    listeners: new Set(),
    lastLine: "",
  };
  active.set(transferId, { proc, meta, tmpKey });

  const emit = (evt) => {
    for (const cb of meta.listeners) {
      try { cb(evt); } catch {}
    }
  };

  const parseProgress = (line) => {
    // rsync --info=progress2 line: "     1,234,567  42%  10.24MB/s    0:00:12"
    const m = line.match(/([\d,]+)\s+(\d+)%\s+([\d.]+[KMGkmg]?B\/s)/i);
    if (m) {
      meta.transferred = Number(m[1].replace(/,/g, ""));
      meta.progress = Number(m[2]);
      meta.speed = m[3];
      emit({ type: "progress", ...snapshot(meta) });
    } else if (line && !line.startsWith(" ") && !line.includes("%")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("sending") && !trimmed.startsWith("receiving") && !trimmed.startsWith("total") && !trimmed.startsWith("sent")) {
        meta.currentFile = trimmed;
        emit({ type: "file", file: trimmed, ...snapshot(meta) });
      }
    }
  };

  let buffer = "";
  const handleChunk = (chunk) => {
    buffer += chunk.toString();
    // rsync uses \r for progress updates
    const lines = buffer.split(/[\r\n]/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      meta.lastLine = line;
      parseProgress(line);
    }
  };
  proc.stdout.on("data", handleChunk);
  proc.stderr.on("data", handleChunk);

  proc.on("close", (code) => {
    meta.status = code === 0 ? "completed" : "failed";
    meta.progress = code === 0 ? 100 : meta.progress;
    meta.finishedAt = Date.now();
    meta.duration = meta.finishedAt - meta.startedAt;
    if (code !== 0) meta.error = meta.lastLine || `rsync exited ${code}`;
    emit({ type: "done", ...snapshot(meta) });
    addHistory({
      serverId, direction, localPath, remotePath,
      status: meta.status, duration: meta.duration,
      transferred: meta.transferred, error: meta.error || null,
    });
    if (tmpKey) { try { fs.unlinkSync(tmpKey); } catch {} }
    setTimeout(() => active.delete(transferId), 5000);
  });

  proc.on("error", (err) => {
    meta.status = "failed";
    meta.error = err.message;
    emit({ type: "done", ...snapshot(meta) });
  });

  return meta;
}

function snapshot(m) {
  const { listeners, ...rest } = m;
  return rest;
}

export function listTransfers() {
  return [...active.values()].map(({ meta }) => snapshot(meta));
}

export function getTransfer(id) {
  const e = active.get(id);
  return e ? snapshot(e.meta) : null;
}

export function cancelTransfer(id) {
  const e = active.get(id);
  if (!e) return false;
  try { e.proc.kill("SIGTERM"); } catch {}
  e.meta.status = "cancelled";
  return true;
}

export function subscribe(id, cb) {
  const e = active.get(id);
  if (!e) return () => {};
  e.meta.listeners.add(cb);
  cb({ type: "snapshot", ...snapshot(e.meta) });
  return () => e.meta.listeners.delete(cb);
}

export function subscribeAll(cb) {
  const unsubs = [];
  for (const e of active.values()) {
    unsubs.push(subscribe(e.meta.id, cb));
  }
  return () => unsubs.forEach((u) => u());
}
