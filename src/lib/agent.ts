// Agent client. On LAN-hosted UI, talk back to the same server hostname on port 8787.
declare global {
  interface Window {
    __AGENT_URL__?: string;
  }
}

function resolveAgentUrl(): string {
  if (typeof window !== "undefined" && window.__AGENT_URL__) return window.__AGENT_URL__;
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_AGENT_URL) {
    return import.meta.env.VITE_AGENT_URL;
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    if (!isLocalhost && hostname) return `${protocol}//${hostname}:8787`;
  }

  return "http://127.0.0.1:8787";
}

const AGENT_URL = resolveAgentUrl();

export const agentUrl = AGENT_URL;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${AGENT_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error((await r.text()) || `Agent error ${r.status}`);
  return r.json() as Promise<T>;
}

export type ServerInfo = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "key";
  hasPassword: boolean;
  hasKey: boolean;
  keyPath: string | null;
  lastUsed: string | null;
};

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size: number;
  mtime: number;
};

export type ListResult = {
  path: string;
  entries: FileEntry[];
  home?: string;
  separator?: string;
  error?: string;
};

export type Transfer = {
  id: string;
  serverId: string;
  direction: "upload" | "download";
  localPath: string;
  remotePath: string;
  queuedAt?: number;
  startedAt: number | null;
  finishedAt?: number;
  duration?: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  speed: string;
  transferred: number;
  total: number;
  currentFile: string;
  error?: string;
};

export type TransferOptions = {
  delete?: boolean;
  bwlimit?: number;
  conflict?: "overwrite" | "skip" | "newer" | "rename";
  backup?: boolean;
  compress?: boolean;
  inplace?: boolean;
  wholeFile?: boolean;
};

export type HistoryEntry = {
  id: string;
  timestamp: string;
  serverId: string;
  direction: string;
  localPath: string;
  remotePath: string;
  status: string;
  duration: number;
  transferred: number;
  error: string | null;
};

export type Bookmark = {
  id: string;
  serverId: string | null;
  side: "local" | "remote";
  name: string;
  path: string;
  createdAt: string;
};

export type TransferPreset = {
  id: string;
  name: string;
  options: TransferOptions;
  createdAt?: string;
};

export type ServerSavePayload = Partial<
  Pick<ServerInfo, "id" | "name" | "host" | "port" | "username" | "authType" | "keyPath">
> & {
  password?: string;
  privateKey?: string;
  passphrase?: string;
};

export const api = {
  health: () => req<{ ok: boolean; home: string; platform: string; separator: string }>("/health"),
  listServers: () => req<ServerInfo[]>("/api/servers"),
  saveServer: (data: ServerSavePayload) =>
    req<ServerInfo>("/api/servers", { method: "POST", body: JSON.stringify(data) }),
  deleteServer: (id: string) => req<{ ok: boolean }>(`/api/servers/${id}`, { method: "DELETE" }),
  testServer: (data: ServerSavePayload) =>
    req<{ ok: boolean; error?: string }>("/api/servers/test", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listLocal: (p?: string) =>
    req<ListResult>(`/api/local/list?path=${encodeURIComponent(p || "~")}`),
  searchLocal: (p: string, q: string) =>
    req<{ root: string; entries: string[] }>(
      `/api/local/search?path=${encodeURIComponent(p || "~")}&q=${encodeURIComponent(q)}`,
    ),
  mkdirLocal: (p: string) =>
    req("/api/local/mkdir", { method: "POST", body: JSON.stringify({ path: p }) }),
  deleteLocal: (p: string) =>
    req("/api/local/delete", { method: "POST", body: JSON.stringify({ path: p }) }),
  renameLocal: (from: string, to: string) =>
    req("/api/local/rename", { method: "POST", body: JSON.stringify({ from, to }) }),
  listRemote: (serverId: string, p?: string) =>
    req<ListResult>(`/api/remote/${serverId}/list?path=${encodeURIComponent(p || ".")}`),
  searchRemote: (serverId: string, p: string, q: string) =>
    req<{ root: string; entries: string[] }>(
      `/api/remote/${serverId}/search?path=${encodeURIComponent(p || ".")}&q=${encodeURIComponent(q)}`,
    ),
  mkdirRemote: (serverId: string, p: string) =>
    req(`/api/remote/${serverId}/mkdir`, { method: "POST", body: JSON.stringify({ path: p }) }),
  deleteRemote: (serverId: string, p: string) =>
    req(`/api/remote/${serverId}/delete`, { method: "POST", body: JSON.stringify({ path: p }) }),
  safeDeleteRemote: (serverId: string, p: string) =>
    req<{ ok: boolean; path: string }>(`/api/remote/${serverId}/safe-delete`, {
      method: "POST",
      body: JSON.stringify({ path: p }),
    }),
  restoreRemote: (serverId: string, from: string, to: string) =>
    req<{ ok: boolean }>(`/api/remote/${serverId}/restore`, {
      method: "POST",
      body: JSON.stringify({ from, to }),
    }),
  chmodRemote: (serverId: string, p: string, mode: string) =>
    req(`/api/remote/${serverId}/chmod`, {
      method: "POST",
      body: JSON.stringify({ path: p, mode }),
    }),
  terminal: (serverId: string, cwd: string, command: string) =>
    req<{ code: number; stdout: string; stderr: string }>(`/api/remote/${serverId}/terminal`, {
      method: "POST",
      body: JSON.stringify({ cwd, command }),
    }),
  renameRemote: (serverId: string, from: string, to: string) =>
    req(`/api/remote/${serverId}/rename`, {
      method: "POST",
      body: JSON.stringify({ from, to }),
    }),
  listTransfers: () => req<Transfer[]>("/api/transfers"),
  startTransfer: (data: {
    serverId: string;
    direction: "upload" | "download";
    localPath: string;
    remotePath: string;
    options?: TransferOptions;
  }) => req<Transfer>("/api/transfers", { method: "POST", body: JSON.stringify(data) }),
  dryRunTransfer: (data: {
    serverId: string;
    direction: "upload" | "download";
    localPath: string;
    remotePath: string;
    options?: TransferOptions;
  }) =>
    req<{ changes: string[]; stdout: string; stderr: string }>("/api/transfers/dry-run", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  cancelTransfer: (id: string) =>
    req<{ ok: boolean }>(`/api/transfers/${id}/cancel`, { method: "POST" }),
  history: () => req<HistoryEntry[]>("/api/history"),
  retryHistory: (id: string) => req<Transfer>(`/api/history/${id}/retry`, { method: "POST" }),
  bookmarks: (serverId?: string | null) =>
    req<Bookmark[]>(`/api/bookmarks${serverId ? `?serverId=${encodeURIComponent(serverId)}` : ""}`),
  saveBookmark: (data: Omit<Bookmark, "id" | "createdAt"> & { id?: string; createdAt?: string }) =>
    req<Bookmark>("/api/bookmarks", { method: "POST", body: JSON.stringify(data) }),
  deleteBookmark: (id: string) =>
    req<{ ok: boolean }>(`/api/bookmarks/${id}`, { method: "DELETE" }),
  presets: () => req<TransferPreset[]>("/api/presets"),
  savePreset: (data: Omit<TransferPreset, "id"> & { id?: string }) =>
    req<TransferPreset>("/api/presets", { method: "POST", body: JSON.stringify(data) }),
  deletePreset: (id: string) => req<{ ok: boolean }>(`/api/presets/${id}`, { method: "DELETE" }),
};

export function openTransfersSocket(onTransfers: (t: Transfer[]) => void) {
  const wsUrl = AGENT_URL.replace(/^http/, "ws") + "/ws";
  let socket: WebSocket | null = null;
  let closed = false;
  let retry = 0;

  const connect = () => {
    if (closed) return;
    socket = new WebSocket(wsUrl);
    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "transfers") onTransfers(msg.transfers);
      } catch {
        return;
      }
    };
    socket.onclose = () => {
      if (closed) return;
      retry = Math.min(retry + 1, 5);
      setTimeout(connect, 500 * retry);
    };
    socket.onerror = () => socket?.close();
  };
  connect();

  return () => {
    closed = true;
    socket?.close();
  };
}
