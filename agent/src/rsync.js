import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { getServer } from "./config.js";
import { addHistory } from "./config.js";

const transfers = new Map(); // transferId -> { proc, meta, request, tmpKey }
const queue = [];
const MAX_CONCURRENT = Math.max(1, Number(process.env.SSH_BRIDGE_MAX_TRANSFERS) || 2);
const RECENT_TTL_MS = 5 * 60 * 1000;

const DIR = path.join(os.homedir(), ".ssh-bridge");
const ASKPASS_PATH = path.join(DIR, "askpass.sh");

function ensureAgentDir() {
  if (!fs.existsSync(DIR)) {
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  }
}

function ensureAskpass() {
  ensureAgentDir();
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
    "-T",
    "-x",
    "-p",
    String(server.port || 22),
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "UserKnownHostsFile=" + path.join(os.homedir(), ".ssh-bridge", "known_hosts"),
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=4",
    "-o",
    "Compression=no",
    "-o",
    "Ciphers=aes128-gcm@openssh.com,chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-ctr",
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

function runningCount() {
  let count = 0;
  for (const { meta } of transfers.values()) {
    if (meta.status === "running") count += 1;
  }
  return count;
}

function snapshot(m) {
  const { listeners, ...rest } = m;
  return rest;
}

function emit(meta, evt) {
  for (const cb of meta.listeners) {
    try {
      cb(evt);
    } catch {}
  }
}

function forgetLater(id) {
  setTimeout(() => transfers.delete(id), RECENT_TTL_MS).unref?.();
}

function cleanupTempKey(record) {
  if (!record.tmpKey) return;
  try {
    fs.unlinkSync(record.tmpKey);
  } catch {}
  record.tmpKey = null;
}

function finishTransfer(record, status, error = null) {
  const { meta } = record;
  if (meta.finishedAt) return;

  meta.status = status;
  meta.progress = status === "completed" ? 100 : meta.progress;
  meta.finishedAt = Date.now();
  meta.duration = meta.startedAt ? meta.finishedAt - meta.startedAt : 0;
  if (error) meta.error = error;

  emit(meta, { type: "done", ...snapshot(meta) });
  addHistory({
    serverId: meta.serverId,
    direction: meta.direction,
    localPath: meta.localPath,
    remotePath: meta.remotePath,
    status: meta.status,
    duration: meta.duration,
    transferred: meta.transferred,
    error: meta.error || null,
  });
  cleanupTempKey(record);
  forgetLater(meta.id);
  pumpQueue();
}

function buildRsyncCommand(server, request, extraArgs = []) {
  const { sshCommand, tmpKey } = makeSshOpts(server);
  const remoteSpec = `${server.username}@${server.host}:${request.remotePath}`;
  const src = request.direction === "upload" ? request.localPath : remoteSpec;
  const dst = request.direction === "upload" ? remoteSpec : request.localPath;
  const args = [
    "-a",
    "--human-readable",
    "--progress",
    "-s",
    "--mkpath",
    "--sparse",
    "--outbuf=N",
    "--no-inc-recursive",
    "--info=progress2,name1,stats1",
    "-e",
    sshCommand,
  ];

  if (request.options.inplace) {
    args.push("--inplace");
  } else {
    args.push("--partial", "--partial-dir=.rsync-partial");
  }

  args.push(...extraArgs);

  if (request.options.compress) {
    args.push("--compress", "--skip-compress=tgz/tar.gz/zip/z/Z/rpm/deb/bz2/rar/7z/mp3/mp4/mkv/avi/mov/png/jpg/jpeg/pdf/webp");
  }

  if (request.options.wholeFile) {
    args.push("--whole-file");
  }

  if (request.options.delete) args.push("--delete");
  if (request.options.conflict === "skip") args.push("--ignore-existing");
  if (request.options.conflict === "newer") args.push("--update");
  if (request.options.conflict === "rename" || request.options.backup) {
    args.push("--backup", "--suffix=.ssh-bridge-backup");
  }
  if (request.options.bwlimit) args.push(`--bwlimit=${request.options.bwlimit}`);
  args.push(src, dst);

  return { args, tmpKey };
}

function buildTransferEnv(server) {
  const env = { ...process.env };
  if (server.authType !== "key" && server.password) {
    ensureAskpass();
    env.SSH_ASKPASS = ASKPASS_PATH;
    env.SSH_ASKPASS_REQUIRE = "force";
    env.SSH_PASSWORD = server.password;
    env.DISPLAY = ":0";
  }
  return env;
}

function attachProgressParser(record) {
  const { meta } = record;
  const parseProgress = (line) => {
    const m = line.match(/([\d,]+)\s+(\d+)%\s+([\d.]+[KMGkmg]?B\/s)/i);
    if (m) {
      meta.transferred = Number(m[1].replace(/,/g, ""));
      meta.progress = Number(m[2]);
      meta.speed = m[3];
      emit(meta, { type: "progress", ...snapshot(meta) });
      return;
    }

    const trimmed = line.trim();
    if (
      trimmed &&
      !trimmed.startsWith("sending") &&
      !trimmed.startsWith("receiving") &&
      !trimmed.startsWith("total") &&
      !trimmed.startsWith("sent") &&
      !trimmed.includes("%") &&
      !trimmed.startsWith("created directory") &&
      trimmed !== "./" &&
      !trimmed.endsWith("/")
    ) {
      meta.currentFile = trimmed;
      emit(meta, { type: "file", file: trimmed, ...snapshot(meta) });
    }
  };

  let stdoutBuffer = "";
  let stderrBuffer = "";
  const rememberErrorLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    meta.errorLines.push(trimmed);
    meta.errorLines = meta.errorLines.slice(-8);
  };
  const handleChunk = (chunk, isError = false) => {
    const nextBuffer = (isError ? stderrBuffer : stdoutBuffer) + chunk.toString();
    const lines = nextBuffer.split(/[\r\n]/);
    if (isError) {
      stderrBuffer = lines.pop() || "";
    } else {
      stdoutBuffer = lines.pop() || "";
    }
    for (const line of lines) {
      meta.lastLine = line;
      if (isError) rememberErrorLine(line);
      parseProgress(line);
    }
  };

  record.proc.stdout.on("data", (chunk) => handleChunk(chunk));
  record.proc.stderr.on("data", (chunk) => handleChunk(chunk, true));
}

function startQueuedTransfer(record) {
  const { meta, request } = record;
  const server = getServer(request.serverId);
  if (!server) {
    finishTransfer(record, "failed", "Server not found");
    return;
  }

  try {
    ensureAgentDir();
    const { args, tmpKey } = buildRsyncCommand(server, request);
    record.tmpKey = tmpKey;
    record.proc = spawn("rsync", args, {
      env: buildTransferEnv(server),
      stdio: ["ignore", "pipe", "pipe"],
    });
    meta.status = "running";
    meta.startedAt = Date.now();
    emit(meta, { type: "started", ...snapshot(meta) });

    attachProgressParser(record);

    record.proc.on("close", (code) => {
      if (meta.status === "cancelled") {
        finishTransfer(record, "cancelled", meta.error || "Transfer cancelled");
      } else {
        finishTransfer(
          record,
          code === 0 ? "completed" : "failed",
          code === 0
            ? null
            : meta.errorLines.length > 0
              ? meta.errorLines.join("\n")
              : meta.lastLine || `rsync exited ${code}`,
        );
      }
    });

    record.proc.on("error", (err) => {
      finishTransfer(record, "failed", err.message);
    });
  } catch (err) {
    finishTransfer(record, "failed", err instanceof Error ? err.message : "Failed to start rsync");
  }
}

function pumpQueue() {
  while (queue.length > 0 && runningCount() < MAX_CONCURRENT) {
    const id = queue.shift();
    const record = transfers.get(id);
    if (!record || record.meta.status !== "queued") continue;
    startQueuedTransfer(record);
  }
}

/**
 * direction: "upload" (local -> remote) | "download" (remote -> local)
 */
export function startTransfer({ serverId, direction, localPath, remotePath, options = {} }) {
  if (!getServer(serverId)) throw new Error("Server not found");

  const transferId = crypto.randomUUID();
  const meta = {
    id: transferId,
    serverId,
    direction,
    localPath,
    remotePath,
    queuedAt: Date.now(),
    startedAt: null,
    status: "queued",
    progress: 0,
    speed: "",
    transferred: 0,
    total: 0,
    currentFile: "",
    listeners: new Set(),
    lastLine: "",
    errorLines: [],
  };
  const record = {
    proc: null,
    meta,
    request: { serverId, direction, localPath, remotePath, options },
    tmpKey: null,
  };

  transfers.set(transferId, record);
  queue.push(transferId);
  pumpQueue();
  return snapshot(meta);
}

export function dryRunTransfer({ serverId, direction, localPath, remotePath, options = {} }) {
  const server = getServer(serverId);
  if (!server) throw new Error("Server not found");
  ensureAgentDir();

  const request = { serverId, direction, localPath, remotePath, options };
  const { args, tmpKey } = buildRsyncCommand(server, request, ["--dry-run", "--itemize-changes"]);

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn("rsync", args, {
      env: buildTransferEnv(server),
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("error", (err) => {
      if (tmpKey) {
        try {
          fs.unlinkSync(tmpKey);
        } catch {}
      }
      reject(err);
    });
    proc.on("close", (code) => {
      if (tmpKey) {
        try {
          fs.unlinkSync(tmpKey);
        } catch {}
      }
      if (code !== 0) {
        reject(new Error(stderr || `rsync dry run exited ${code}`));
        return;
      }
      const changes = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("sending") && !line.startsWith("sent "));
      resolve({ changes, stdout, stderr });
    });
  });
}

export function listTransfers() {
  return [...transfers.values()].map(({ meta }) => snapshot(meta));
}

export function getTransfer(id) {
  const e = transfers.get(id);
  return e ? snapshot(e.meta) : null;
}

export function cancelTransfer(id) {
  const record = transfers.get(id);
  if (!record) return false;

  const { meta } = record;
  if (meta.status === "queued") {
    const idx = queue.indexOf(id);
    if (idx !== -1) queue.splice(idx, 1);
    finishTransfer(record, "cancelled", "Transfer cancelled before start");
    return true;
  }

  if (meta.status !== "running") return false;
  meta.status = "cancelled";
  meta.error = "Transfer cancelled";
  emit(meta, { type: "cancelled", ...snapshot(meta) });
  try {
    record.proc?.kill("SIGTERM");
  } catch {}
  return true;
}

export function subscribe(id, cb) {
  const e = transfers.get(id);
  if (!e) return () => {};
  e.meta.listeners.add(cb);
  cb({ type: "snapshot", ...snapshot(e.meta) });
  return () => e.meta.listeners.delete(cb);
}

export function subscribeAll(cb) {
  const unsubs = [];
  for (const e of transfers.values()) {
    unsubs.push(subscribe(e.meta.id, cb));
  }
  return () => unsubs.forEach((u) => u());
}
