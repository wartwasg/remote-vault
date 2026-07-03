import { Server, Plus, Circle, Trash2, Pencil, Zap } from "lucide-react";
import type { ServerInfo } from "@/lib/agent";
import { cn } from "@/lib/utils";
import { useAgentStatus } from "@/hooks/useAgentStatus";

interface Props {
  servers: ServerInfo[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: (s: ServerInfo) => void;
  onDelete: (s: ServerInfo) => void;
}

export function ServerSidebar({ servers, activeId, onSelect, onAdd, onEdit, onDelete }: Props) {
  const status = useAgentStatus();
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-glow shadow-glow">
          <Zap className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-sidebar-foreground">SSH Bridge</div>
          <div className="flex items-center gap-1.5 text-[10px] font-medium">
            <Circle
              className={cn(
                "h-1.5 w-1.5 fill-current",
                status?.ok ? "text-success" : "text-destructive"
              )}
            />
            <span className="text-muted-foreground uppercase tracking-wider">
              {status?.ok ? "Agent online" : "Agent offline"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Servers
        </div>
        <button
          onClick={onAdd}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
          title="Add server"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-4">
        {servers.length === 0 ? (
          <button
            onClick={onAdd}
            className="mx-2 mt-2 flex w-[calc(100%-1rem)] flex-col items-center gap-2 rounded-xl border border-dashed border-sidebar-border px-4 py-8 text-center text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-sidebar-accent/40 hover:text-foreground"
          >
            <Server className="h-5 w-5" />
            <span>No servers yet</span>
            <span className="text-primary">+ Add your first</span>
          </button>
        ) : (
          <ul className="space-y-1">
            {servers.map((s) => {
              const active = s.id === activeId;
              return (
                <li key={s.id}>
                  <div
                    className={cn(
                      "group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition",
                      active
                        ? "bg-sidebar-accent shadow-sm ring-1 ring-primary/30"
                        : "hover:bg-sidebar-accent/60"
                    )}
                    onClick={() => onSelect(s.id)}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                        active
                          ? "bg-primary/15 text-primary"
                          : "bg-sidebar-accent text-muted-foreground group-hover:text-sidebar-foreground"
                      )}
                    >
                      <Server className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium text-sidebar-foreground">
                        {s.name}
                      </div>
                      <div className="truncate font-mono text-[10.5px] text-muted-foreground">
                        {s.username}@{s.host}
                      </div>
                    </div>
                    <div className="flex items-center opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(s);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-surface-3 hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(s);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="text-[10px] font-mono text-muted-foreground">
          {status?.info?.platform || "—"} · {servers.length} server{servers.length === 1 ? "" : "s"}
        </div>
      </div>
    </aside>
  );
}
