import { useEffect, useState } from "react";
import { api, type ServerInfo } from "@/lib/agent";

let cache: ServerInfo[] | null = null;
const listeners = new Set<(s: ServerInfo[]) => void>();

export function useServers() {
  const [servers, setServers] = useState<ServerInfo[]>(cache || []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    listeners.add(setServers);
    if (!cache) refresh().finally(() => setLoading(false));
    return () => {
      listeners.delete(setServers);
    };
  }, []);

  return { servers, loading, refresh };
}

export async function refresh() {
  const list = await api.listServers();
  cache = list;
  listeners.forEach((l) => l(list));
  return list;
}
