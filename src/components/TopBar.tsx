import { Server, ChevronDown, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ServerInfo } from "@/lib/agent";
import { useAgentStatus } from "@/hooks/useAgentStatus";

interface Props {
  servers: ServerInfo[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function TopBar({ servers, activeId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const active = servers.find((s) => s.id === activeId);
  const status = useAgentStatus();

  return (
    <header className="flex items-center gap-3 border-b border-border/60 bg-surface/40 px-4 py-2.5 backdrop-blur">
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm transition hover:bg-surface-2",
            !active && "text-muted-foreground"
          )}
        >
          <Server className="h-3.5 w-3.5" />
          <span className="font-medium">
            {active ? active.name : "No server selected"}
          </span>
          {active && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {active.username}@{active.host}:{active.port}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        {open && servers.length > 0 && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="glass-strong absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl shadow-elevated">
              <div className="max-h-72 overflow-y-auto p-1">
                {servers.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      onSelect(s.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-surface-2",
                      s.id === activeId && "bg-primary/10"
                    )}
                  >
                    <Server className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.name}</div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {s.username}@{s.host}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1 font-mono text-[11px]">
          {status?.ok ? (
            <><Wifi className="h-3 w-3 text-success" /><span className="text-muted-foreground">agent</span></>
          ) : (
            <><WifiOff className="h-3 w-3 text-destructive" /><span className="text-destructive">agent offline</span></>
          )}
        </div>
      </div>
    </header>
  );
}
