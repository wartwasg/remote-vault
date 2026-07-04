import { useEffect, useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  Upload,
  Download,
  XCircle,
  Check,
  Loader2,
  Zap,
  Clock3,
  History,
  RotateCw,
} from "lucide-react";
import type { HistoryEntry, Transfer } from "@/lib/agent";
import { api } from "@/lib/agent";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  transfers: Transfer[];
}

export function TransferPanel({ transfers }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const active = transfers.filter((t) => t.status === "running");
  const queued = transfers.filter((t) => t.status === "queued");
  const done = transfers.filter((t) => t.status !== "running" && t.status !== "queued");

  useEffect(() => {
    api
      .history()
      .then((items) => setHistory(items.slice(0, 8)))
      .catch(() => setHistory([]));
  }, [transfers]);

  return (
    <div
      className={cn(
        "glass-strong flex shrink-0 flex-col overflow-hidden rounded-2xl transition-all",
        collapsed ? "h-11" : "h-64",
      )}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left hover:bg-surface-2/40"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Zap className="h-3.5 w-3.5" />
        </div>
        <div className="text-xs font-semibold uppercase tracking-wider">Transfer Queue</div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {active.length > 0 && (
            <>
              <span className="flex h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span>{active.length} running</span>
            </>
          )}
          {queued.length > 0 && (
            <span>
              {active.length > 0 ? "· " : ""}
              {queued.length} queued
            </span>
          )}
          {done.length > 0 && <span>· {done.length} recent</span>}
          {transfers.length === 0 && <span>Idle</span>}
        </div>
        <div className="ml-auto text-muted-foreground">
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {!collapsed && (
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {transfers.length === 0 ? (
            <div className="flex h-full flex-col">
              <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center text-xs text-muted-foreground">
                <Upload className="h-5 w-5 opacity-40" />
                <div>Drag files between panels to start a transfer</div>
              </div>
              <HistoryList history={history} />
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border/40">
                {transfers.map((t) => (
                  <TransferRow key={t.id} t={t} />
                ))}
              </ul>
              <HistoryList history={history} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryList({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <div className="border-t border-border/60 px-4 py-2">
      <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <History className="h-3 w-3" />
        History
      </div>
      <ul className="space-y-1">
        {history.slice(0, 4).map((item) => (
          <li
            key={item.id}
            className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-2/50"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-[10.5px] text-muted-foreground">
                {item.direction} · {item.localPath} → {item.remotePath}
              </div>
            </div>
            <button
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-primary/15 hover:text-primary"
              title="Retry"
              onClick={() => api.retryHistory(item.id)}
            >
              <RotateCw className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TransferRow({ t }: { t: Transfer }) {
  const Dir = t.direction === "upload" ? Upload : Download;
  const statusColor =
    t.status === "completed"
      ? "text-success"
      : t.status === "failed"
        ? "text-destructive"
        : t.status === "cancelled"
          ? "text-muted-foreground"
          : "text-primary";
  return (
    <li className="grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-2.5">
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          t.status === "running"
            ? "bg-primary/15 text-primary"
            : t.status === "queued"
              ? "bg-primary/10 text-primary"
              : t.status === "completed"
                ? "bg-success/15 text-success"
                : t.status === "failed"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-surface-3 text-muted-foreground",
        )}
      >
        {t.status === "running" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : t.status === "queued" ? (
          <Clock3 className="h-3.5 w-3.5" />
        ) : t.status === "completed" ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Dir className="h-3.5 w-3.5" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="truncate font-medium">
            {t.currentFile
              ? t.currentFile.split("/").pop()
              : t.direction === "upload"
                ? t.localPath.split(/[/\\]/).pop()
                : t.remotePath.split("/").pop()}
          </span>
          <span className={cn("text-[10px] font-semibold uppercase tracking-wider", statusColor)}>
            {t.status}
          </span>
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
          {t.direction === "upload" ? "↑" : "↓"}{" "}
          {t.direction === "upload" ? t.localPath : t.remotePath}
          {" → "}
          {t.direction === "upload" ? t.remotePath : t.localPath}
        </div>
        {t.status === "queued" && (
          <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">
            Waiting for an open transfer slot
          </div>
        )}
        {t.status === "running" && (
          <div className="mt-1.5">
            <div className="h-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow transition-all"
                style={{ width: `${t.progress || 0}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>
                {t.progress || 0}% · {formatBytes(t.transferred || 0)}
              </span>
              <span>{t.speed || "—"}</span>
            </div>
          </div>
        )}
        {t.status === "failed" && t.error && (
          <div className="mt-1 truncate font-mono text-[10.5px] text-destructive/80">{t.error}</div>
        )}
      </div>
      {(t.status === "running" || t.status === "queued") && (
        <button
          onClick={() => api.cancelTransfer(t.id)}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
          title="Cancel"
        >
          <XCircle className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}
