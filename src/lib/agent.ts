// Agent client — talks to the local Node companion running on 127.0.0.1:8787
const AGENT_URL =
  (typeof window !== "undefined" && (window as any).__AGENT_URL__) ||
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_AGENT_URL) ||
  "http://127.0.0.1:8787";

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
  startedAt: number;
  finishedAt?: number;
  duration?: number;
  status: "running" | "completed" | "failed" | "cancelled";
  progress: number;
  speed: string;
  transferred: number;
  total: number;
  currentFile: string;
  error?: string;
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

export const api = {
  health: () => req<{ ok: boolean; home: string; platform: string; separator: string }>("/health"),
  listServers: () => req<ServerInfo[]>("/api/servers"),
  saveServer: (data: any) =>
    req<ServerInfo>("/api/servers", { method: "POST", body: JSON.stringify(data) }),
  deleteServer: (id: string) => req<{ ok: boolean }>(`/api/servers/${id}`, { method: "DELETE" }),
  testServer: (data: any) =>
    req<{ ok: boolean; error?: string }>("/api/servers/test", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listLocal: (p?: string) =>
    req<ListResult>(`/api/local/list?path=${encodeURIComponent(p || "~")}`),
  mkdirLocal: (p: string) =>
    req("/api/local/mkdir", { method: "POST", body: JSON.stringify({ path: p }) }),
  deleteLocal: (p: string) =>
    req("/api/local/delete", { method: "POST", body: JSON.stringify({ path: p }) }),
  renameLocal: (from: string, to: string) =>
    req("/api/local/rename", { method: "POST", body: JSON.stringify({ from, to }) }),
  listRemote: (serverId: string, p?: string) =>
    req<ListResult>(`/api/remote/${serverId}/list?path=${encodeURIComponent(p || ".")}`),
  mkdirRemote: (serverId: string, p: string) =>
    req(`/api/remote/${serverId}/mkdir`, { method: "POST", body: JSON.stringify({ path: p }) }),
  deleteRemote: (serverId: string, p: string) =>
    req(`/api/remote/${serverId}/delete`, { method: "POST", body: JSON.stringify({ path: p }) }),
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
    options?: { delete?: boolean; bwlimit?: number };
  }) => req<Transfer>("/api/transfers", { method: "POST", body: JSON.stringify(data) }),
  cancelTransfer: (id: string) =>
    req<{ ok: boolean }>(`/api/transfers/${id}/cancel`, { method: "POST" }),
  history: () => req<HistoryEntry[]>("/api/history"),
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
      } catch {}
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
