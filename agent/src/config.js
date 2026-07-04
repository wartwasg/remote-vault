import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const DIR = path.join(os.homedir(), ".ssh-bridge");
const FILE = path.join(DIR, "servers.json");
const KEY_FILE = path.join(DIR, "key");

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
}

function getKey() {
  ensureDir();
  if (!fs.existsSync(KEY_FILE)) {
    fs.writeFileSync(KEY_FILE, crypto.randomBytes(32), { mode: 0o600 });
  }
  return fs.readFileSync(KEY_FILE);
}

function encrypt(plain) {
  if (plain == null || plain === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(blob) {
  if (!blob) return null;
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

function readRaw() {
  ensureDir();
  if (!fs.existsSync(FILE)) return { servers: [], history: [], bookmarks: [], presets: [] };
  try {
    const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return {
      servers: data.servers || [],
      history: data.history || [],
      bookmarks: data.bookmarks || [],
      presets: data.presets || [],
    };
  } catch {
    return { servers: [], history: [], bookmarks: [], presets: [] };
  }
}

function writeRaw(data) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function listServers() {
  const { servers } = readRaw();
  // Never leak secrets to the client
  return servers.map((s) => ({
    id: s.id,
    name: s.name,
    host: s.host,
    port: s.port,
    username: s.username,
    authType: s.authType,
    hasPassword: !!s.password,
    hasKey: !!s.privateKey,
    keyPath: s.keyPath || null,
    lastUsed: s.lastUsed || null,
  }));
}

export function getServer(id) {
  const { servers } = readRaw();
  const s = servers.find((x) => x.id === id);
  if (!s) return null;
  return {
    ...s,
    password: decrypt(s.password),
    privateKey: decrypt(s.privateKey),
    passphrase: decrypt(s.passphrase),
  };
}

export function saveServer(input) {
  const data = readRaw();
  const id = input.id || crypto.randomUUID();
  const existing = data.servers.find((s) => s.id === id);
  const merged = {
    id,
    name: input.name || input.host,
    host: input.host,
    port: Number(input.port) || 22,
    username: input.username,
    authType: input.authType || (input.privateKey ? "key" : "password"),
    password: input.password ? encrypt(input.password) : existing?.password || null,
    privateKey: input.privateKey ? encrypt(input.privateKey) : existing?.privateKey || null,
    passphrase: input.passphrase ? encrypt(input.passphrase) : existing?.passphrase || null,
    keyPath: input.keyPath || existing?.keyPath || null,
    lastUsed: existing?.lastUsed || null,
  };
  if (existing) {
    data.servers = data.servers.map((s) => (s.id === id ? merged : s));
  } else {
    data.servers.push(merged);
  }
  writeRaw(data);
  return listServers().find((s) => s.id === id);
}

export function deleteServer(id) {
  const data = readRaw();
  data.servers = data.servers.filter((s) => s.id !== id);
  writeRaw(data);
}

export function touchServer(id) {
  const data = readRaw();
  const s = data.servers.find((x) => x.id === id);
  if (s) {
    s.lastUsed = new Date().toISOString();
    writeRaw(data);
  }
}

export function addHistory(entry) {
  const data = readRaw();
  data.history = data.history || [];
  data.history.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...entry });
  data.history = data.history.slice(0, 500);
  writeRaw(data);
}

export function listHistory() {
  return readRaw().history || [];
}

export function listBookmarks(serverId = null) {
  const { bookmarks } = readRaw();
  return bookmarks.filter((b) => !serverId || b.serverId === serverId || b.side === "local");
}

export function saveBookmark(input) {
  const data = readRaw();
  const id = input.id || crypto.randomUUID();
  const bookmark = {
    id,
    serverId: input.serverId || null,
    side: input.side,
    name: input.name || input.path,
    path: input.path,
    createdAt: input.createdAt || new Date().toISOString(),
  };
  data.bookmarks = data.bookmarks.filter((b) => b.id !== id);
  data.bookmarks.unshift(bookmark);
  data.bookmarks = data.bookmarks.slice(0, 200);
  writeRaw(data);
  return bookmark;
}

export function deleteBookmark(id) {
  const data = readRaw();
  data.bookmarks = data.bookmarks.filter((b) => b.id !== id);
  writeRaw(data);
  return true;
}

export function listPresets() {
  const { presets } = readRaw();
  if (presets.length > 0) return presets;
  return [
    {
      id: "fast",
      name: "Fast sync",
      options: { conflict: "overwrite" },
    },
    {
      id: "safe",
      name: "Safe backup",
      options: { conflict: "rename", backup: true },
    },
    {
      id: "mirror",
      name: "Mirror deploy",
      options: { delete: true, conflict: "overwrite" },
    },
  ];
}

export function savePreset(input) {
  const data = readRaw();
  const id = input.id || crypto.randomUUID();
  const preset = {
    id,
    name: input.name || "Transfer preset",
    options: input.options || {},
    createdAt: input.createdAt || new Date().toISOString(),
  };
  data.presets = data.presets.filter((p) => p.id !== id);
  data.presets.unshift(preset);
  data.presets = data.presets.slice(0, 50);
  writeRaw(data);
  return preset;
}

export function deletePreset(id) {
  const data = readRaw();
  data.presets = data.presets.filter((p) => p.id !== id);
  writeRaw(data);
  return true;
}
