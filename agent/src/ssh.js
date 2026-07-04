import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getServer, touchServer } from "./config.js";

const pool = new Map(); // serverId -> { client, sftp, lastUsed }
const connectionAttempts = new Map(); // serverId -> Promise<entry>
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const SFTP_OP_TIMEOUT_MS = 45 * 1000;

function isVisibleEntry(name) {
  return name !== "." && name !== ".." && !name.startsWith(".");
}

function sortEntries(a, b) {
  if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

function closeEntry(entry) {
  try {
    entry.client.end();
  } catch {}
}

function withTimeout(operation, message = "SFTP operation timed out") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), SFTP_OP_TIMEOUT_MS);
    operation(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function execRemoteCommand(client, command, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Remote command timed out")), timeoutMs);
    client.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        reject(err);
        return;
      }
      let stdout = "";
      let stderr = "";
      stream.on("data", (data) => {
        stdout += data.toString();
      });
      stream.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      stream.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
  });
}

function resolveAuth(server) {
  const cfg = {
    host: server.host,
    port: server.port || 22,
    username: server.username,
    readyTimeout: 30000,
    keepaliveInterval: 20000,
  };
  if (server.authType === "key" || server.privateKey || server.keyPath) {
    let key = server.privateKey;
    if (!key && server.keyPath) {
      const p = server.keyPath.startsWith("~")
        ? path.join(os.homedir(), server.keyPath.slice(1))
        : server.keyPath;
      key = fs.readFileSync(p);
    }
    cfg.privateKey = key;
    if (server.passphrase) cfg.passphrase = server.passphrase;
  } else {
    cfg.password = server.password;
  }
  return cfg;
}

export function connect(server) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    console.log(
      `[ssh] Connecting to ${server.username}@${server.host}:${server.port || 22} (auth: ${server.authType || "auto"})...`,
    );
    client.on("ready", () => {
      console.log(`[ssh] Connected to ${server.host}`);
      client.sftp((err, sftp) => {
        if (err) {
          client.end();
          return reject(err);
        }
        resolve({ client, sftp });
      });
    });
    client.on("error", (err) => {
      console.error(`[ssh] Connection error for ${server.host}:`, err.message);
      reject(err);
    });
    try {
      client.connect(resolveAuth(server));
    } catch (e) {
      reject(e);
    }
  });
}

export async function getConnection(serverId) {
  const cached = pool.get(serverId);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached;
  }
  const pending = connectionAttempts.get(serverId);
  if (pending) return pending;

  const server = getServer(serverId);
  if (!server) throw new Error("Server not found");

  const attempt = connect(server)
    .then(({ client, sftp }) => {
      const entry = { client, sftp, lastUsed: Date.now() };
      pool.set(serverId, entry);
      client.on("close", () => pool.delete(serverId));
      client.on("end", () => pool.delete(serverId));
      client.on("error", (err) => {
        console.error(`SSH client error for server ${serverId}:`, err);
        pool.delete(serverId);
      });
      touchServer(serverId);
      return entry;
    })
    .finally(() => {
      connectionAttempts.delete(serverId);
    });

  connectionAttempts.set(serverId, attempt);
  return attempt;
}

export function disconnect(serverId) {
  const e = pool.get(serverId);
  if (e) {
    try {
      e.client.end();
    } catch {}
    pool.delete(serverId);
  }
}

export async function testConnection(server) {
  const { client } = await connect(server);
  client.end();
  return true;
}

function statToEntry(name, parentPath, attrs) {
  const isDir = attrs.isDirectory();
  const isLink = attrs.isSymbolicLink();
  return {
    name,
    path: path.posix.join(parentPath, name),
    type: isDir ? "directory" : isLink ? "symlink" : "file",
    size: attrs.size,
    mtime: attrs.mtime * 1000,
    mode: attrs.mode,
  };
}

async function readRemoteDir(serverId, dirPath) {
  const { sftp } = await getConnection(serverId);
  const p = dirPath || ".";
  return withTimeout((resolve, reject) => {
    const listDirectory = (abs) => {
      sftp.readdir(abs, (err, list) => {
        if (err) {
          reject(err);
          return;
        }
        const entries = [];
        for (const item of list) {
          if (isVisibleEntry(item.filename)) {
            entries.push(statToEntry(item.filename, abs, item.attrs));
          }
        }
        entries.sort(sortEntries);
        resolve({ path: abs, entries });
      });
    };

    if (p === "." || p === "~") {
      sftp.realpath(".", (err, abs) => (err ? reject(err) : listDirectory(abs)));
      return;
    }

    listDirectory(p);
  }, `Timed out while listing ${p}`);
}

export async function listRemote(serverId, dirPath) {
  try {
    return await readRemoteDir(serverId, dirPath);
  } catch (error) {
    disconnect(serverId);
    return readRemoteDir(serverId, dirPath);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [serverId, entry] of pool.entries()) {
    if (now - entry.lastUsed > IDLE_TIMEOUT_MS) {
      pool.delete(serverId);
      closeEntry(entry);
    }
  }
}, IDLE_TIMEOUT_MS).unref?.();

export async function deleteRemote(serverId, targetPath) {
  const { sftp, client } = await getConnection(serverId);
  // Try file first, fall back to recursive rm via exec for directories
  return new Promise((resolve, reject) => {
    sftp.stat(targetPath, (err, stats) => {
      if (err) return reject(err);
      if (stats.isDirectory()) {
        client.exec(`rm -rf -- ${shellQuote(targetPath)}`, (e, stream) => {
          if (e) return reject(e);
          stream.on("close", (code) =>
            code === 0 ? resolve(true) : reject(new Error("rm failed")),
          );
          stream.resume();
          stream.stderr.resume();
        });
      } else {
        sftp.unlink(targetPath, (e) => (e ? reject(e) : resolve(true)));
      }
    });
  });
}

export async function safeDeleteRemote(serverId, targetPath) {
  const { client } = await getConnection(serverId);
  const trashDir = "~/.ssh-bridge-trash";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = path.posix.basename(targetPath);
  const trashedPath = `${trashDir}/${stamp}-${baseName}`;
  const command = `mkdir -p ${trashDir} && mv -- ${shellQuote(targetPath)} ${shellQuote(trashedPath)}`;
  const result = await execRemoteCommand(client, command);
  if (result.code !== 0) throw new Error(result.stderr || "Safe delete failed");
  return { ok: true, path: trashedPath };
}

export async function restoreRemote(serverId, trashedPath, targetPath) {
  const { client } = await getConnection(serverId);
  const command = `mv -- ${shellQuote(trashedPath)} ${shellQuote(targetPath)}`;
  const result = await execRemoteCommand(client, command);
  if (result.code !== 0) throw new Error(result.stderr || "Restore failed");
  return { ok: true };
}

export async function chmodRemote(serverId, targetPath, mode) {
  if (!/^[0-7]{3,4}$/.test(String(mode))) throw new Error("Mode must look like 644 or 0755");
  const { sftp } = await getConnection(serverId);
  return new Promise((resolve, reject) => {
    sftp.chmod(targetPath, parseInt(String(mode), 8), (e) => (e ? reject(e) : resolve(true)));
  });
}

export async function searchRemote(serverId, rootPath, query) {
  if (!query || String(query).trim().length < 1) return { root: rootPath, entries: [] };
  const { client } = await getConnection(serverId);
  const command = `find ${shellQuote(rootPath || ".")} -path '*/.*' -prune -o -iname ${shellQuote(`*${query}*`)} -print | head -200`;
  const result = await execRemoteCommand(client, command, 45000);
  if (result.code !== 0) throw new Error(result.stderr || "Remote search failed");
  return {
    root: rootPath,
    entries: result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

export async function runRemoteCommand(serverId, cwd, command) {
  if (!command || !String(command).trim()) throw new Error("Command is required");
  const { client } = await getConnection(serverId);
  const result = await execRemoteCommand(
    client,
    `cd ${shellQuote(cwd || ".")} && ${command}`,
    120000,
  );
  return result;
}

export async function renameRemote(serverId, from, to) {
  const { sftp } = await getConnection(serverId);
  return new Promise((resolve, reject) => {
    sftp.rename(from, to, (e) => (e ? reject(e) : resolve(true)));
  });
}

export async function mkdirRemote(serverId, dirPath) {
  const { sftp } = await getConnection(serverId);
  return new Promise((resolve, reject) => {
    sftp.mkdir(dirPath, (e) => (e ? reject(e) : resolve(true)));
  });
}
