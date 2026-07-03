import { useEffect, useState } from "react";
import { openTransfersSocket, type Transfer, api } from "@/lib/agent";

let cache: Transfer[] = [];
const listeners = new Set<(t: Transfer[]) => void>();
let started = false;
let stop: (() => void) | null = null;

function startIfNeeded() {
  if (started) return;
  started = true;
  api.listTransfers().then((t) => {
    cache = t;
    listeners.forEach((l) => l(t));
  }).catch(() => {});
  stop = openTransfersSocket((t) => {
    cache = t;
    listeners.forEach((l) => l(t));
  });
}

export function useTransfers() {
  const [transfers, setTransfers] = useState<Transfer[]>(cache);
  useEffect(() => {
    startIfNeeded();
    listeners.add(setTransfers);
    return () => {
      listeners.delete(setTransfers);
    };
  }, []);
  return transfers;
}
