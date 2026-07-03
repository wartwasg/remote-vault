import { useEffect, useState } from "react";
import { api } from "@/lib/agent";

let cache: { ok: boolean; error?: string; info?: any } | null = null;
const listeners = new Set<(s: any) => void>();

export function useAgentStatus() {
  const [status, setStatus] = useState(cache);
  useEffect(() => {
    listeners.add(setStatus);
    if (!cache) checkStatus();
    const t = setInterval(checkStatus, 5000);
    return () => {
      listeners.delete(setStatus);
      clearInterval(t);
    };
  }, []);
  return status;
}

export async function checkStatus() {
  try {
    const info = await api.health();
    cache = { ok: true, info };
  } catch (e: any) {
    cache = { ok: false, error: e?.message || "Agent offline" };
  }
  listeners.forEach((l) => l(cache));
  return cache;
}
