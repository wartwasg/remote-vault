import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getServer, touchServer } from "./config.js";

const pool = new Map(); // serverId -> { client, sftp, lastUsed }

function resolveAuth(server) {
  const cfg = {
    host: server.host,
    port: server.port || 22,
    username: server.username,
    readyTimeout: 15000,
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
    client.on("ready", () => {
      client.sftp((err, sftp) => {
        if (err) {
          client.end();
          return reject(err);
        }
        resolve({ client, sftp });
      });
    });
    client.on("error", reject);
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
  const server = getServer(serverId);
  if (!server) throw new Error("Server not found");
  const { client, sftp } = await connect(server);
  const entry = { client, sftp, lastUsed: Date.now() };
  pool.set(serverId, entry);
  client.on("close", () => pool.delete(serverId));
  client.on("end", () => pool.delete(serverId));
  touchServer(serverId);
  return entry;
}

export function disconnect(serverId) {
  const e = pool.get(serverId);
  if (e) {
    try { e.client.end(); } catch {}
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

export async function listRemote(serverId, dirPath) {
  const { sftp } = await getConnection(serverId);
  const p = dirPath || ".";
  return new Promise((resolve, reject) => {
    // Resolve absolute path first if using "." or "~"
    const doList = (abs) => {
      sftp.readdir(abs, (err, list) => {
        if (err) return reject(err);
        const entries = list
          .filter((e) => e.filename !== "." && e.filename !== "..")
          .map((e) => statToEntry(e.filename, abs, e.attrs))
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        resolve({ path: abs, entries });
      });
    };
    if (p === "." || p === "~") {
      sftp.realpath(".", (err, abs) => (err ? reject(err) : doList(abs)));
    } else {
      doList(p);
    }
  });
}

export async function deleteRemote(serverId, targetPath) {
  const { sftp, client } = await getConnection(serverId);
  // Try file first, fall back to recursive rm via exec for directories
  return new Promise((resolve, reject) => {
    sftp.stat(targetPath, (err, stats) => {
      if (err) return reject(err);
      if (stats.isDirectory()) {
        client.exec(`rm -rf ${JSON.stringify(targetPath)}`, (e, stream) => {
          if (e) return reject(e);
          stream.on("close", (code) =>
            code === 0 ? resolve(true) : reject(new Error("rm failed"))
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
