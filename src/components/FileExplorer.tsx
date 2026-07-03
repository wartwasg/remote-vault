import { useEffect, useState, useMemo } from "react";
import {
  Folder, FolderOpen, File as FileIcon, ChevronRight, Home, RotateCw,
  ArrowUp, Search, Loader2, AlertCircle, Upload, Download, HardDrive, Cloud,
} from "lucide-react";
import { api, type FileEntry } from "@/lib/agent";
import { formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Side = "local" | "remote";

interface Props {
  side: Side;
  serverId?: string | null;
  onTransfer: (file: FileEntry) => void;
  onDropFiles: (paths: string[]) => void;
  dragBusy?: boolean;
}

export function FileExplorer({ side, serverId, onTransfer, onDropFiles, dragBusy }: Props) {
  const [path, setPath] = useState<string>(side === "local" ? "~" : ".");
  const [data, setData] = useState<{ path: string; entries: FileEntry[]; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);

  const separator = side === "remote" ? "/" : data?.path?.includes("\\") ? "\\" : "/";

  const load = async (p: string) => {
    setLoading(true);
    setSelected(new Set());
    try {
      const res =
        side === "local"
          ? await api.listLocal(p)
          : serverId
          ? await api.listRemote(serverId, p)
          : { path: p, entries: [], error: "No server selected" };
      setData(res);
      setPath(res.path);
    } catch (e: any) {
      setData({ path: p, entries: [], error: e?.message || "Failed to list" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (side === "remote" && !serverId) {
      setData({ path: "", entries: [], error: "Select a server to browse" });
      return;
    }
    load(side === "local" ? "~" : ".");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, serverId]);

  const goUp = () => {
    if (!data?.path) return;
    const parts = data.path.split(separator).filter(Boolean);
    if (parts.length === 0) return;
    parts.pop();
    const parent = separator === "/" ? "/" + parts.join("/") : parts.join("\\") + "\\";
    load(parent || "/");
  };

  const goHome = () => load(side === "local" ? "~" : ".");

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!query) return data.entries;
    const q = query.toLowerCase();
    return data.entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [data, query]);

  const crumbs = useMemo(() => {
    if (!data?.path) return [];
    return data.path.split(separator).filter(Boolean);
  }, [data, separator]);

  const goToCrumb = (i: number) => {
    const parts = crumbs.slice(0, i + 1);
    const p = separator === "/" ? "/" + parts.join("/") : parts.join("\\") + "\\";
    load(p);
  };

  const handleDoubleClick = (e: FileEntry) => {
    if (e.type === "directory") load(e.path);
    else onTransfer(e);
  };

  const handleDragStart = (e: React.DragEvent, entry: FileEntry) => {
    const paths = selected.has(entry.path) ? [...selected] : [entry.path];
    e.dataTransfer.setData("application/x-ssh-bridge", JSON.stringify({ side, paths }));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData("application/x-ssh-bridge");
    if (!raw) return;
    const payload = JSON.parse(raw);
    if (payload.side === side) return; // same side, ignore
    onDropFiles(payload.paths);
  };

  const Icon = side === "local" ? HardDrive : Cloud;
  const label = side === "local" ? "Local" : "Remote";

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl glass",
        dragOver && "ring-2 ring-primary shadow-glow"
      )}
      onDragOver={(e) => {
        const has = e.dataTransfer.types.includes("application/x-ssh-bridge");
        if (has) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
        <div className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md",
          side === "local" ? "bg-surface-3 text-foreground" : "bg-primary/15 text-primary"
        )}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            onClick={goUp}
            title="Up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            onClick={goHome}
            title="Home"
          >
            <Home className="h-3.5 w-3.5" />
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            onClick={() => load(path)}
            title="Refresh"
          >
            <RotateCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Breadcrumb + Search */}
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <div className="scrollbar-thin flex flex-1 items-center gap-0.5 overflow-x-auto text-xs">
          <button
            onClick={goHome}
            className="rounded px-1.5 py-0.5 font-mono text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            {separator === "/" ? "/" : ""}
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-0.5">
              <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              <button
                onClick={() => goToCrumb(i)}
                className="rounded px-1.5 py-0.5 font-mono text-foreground hover:bg-surface-2"
              >
                {c}
              </button>
            </span>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter"
            className="h-7 w-32 rounded-md border border-border bg-surface pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* File list */}
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {loading && !data ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : data?.error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-6 w-6 text-warning" />
            <div>{data.error}</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Empty directory
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface/80 backdrop-blur">
              <tr className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-1.5 text-left font-medium">Name</th>
                <th className="w-24 px-3 py-1.5 text-right font-medium">Size</th>
                <th className="hidden w-40 px-3 py-1.5 text-right font-medium md:table-cell">Modified</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const isSelected = selected.has(entry.path);
                return (
                  <tr
                    key={entry.path}
                    draggable
                    onDragStart={(e) => handleDragStart(e, entry)}
                    onClick={(e) => {
                      const next = new Set(e.metaKey || e.ctrlKey ? selected : []);
                      if (isSelected && (e.metaKey || e.ctrlKey)) next.delete(entry.path);
                      else next.add(entry.path);
                      setSelected(next);
                    }}
                    onDoubleClick={() => handleDoubleClick(entry)}
                    className={cn(
                      "group cursor-pointer border-b border-border/30 transition",
                      isSelected ? "bg-primary/10" : "hover:bg-surface-2/60"
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        {entry.type === "directory" ? (
                          <Folder className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{entry.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                      {entry.type === "directory" ? "—" : formatBytes(entry.size)}
                    </td>
                    <td className="hidden px-3 py-1.5 text-right font-mono text-[11px] text-muted-foreground md:table-cell">
                      {formatDate(entry.mtime)}
                    </td>
                    <td className="px-1 py-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onTransfer(entry);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-primary/20 hover:text-primary"
                        title={side === "local" ? "Upload" : "Download"}
                      >
                        {side === "local" ? (
                          <Upload className="h-3 w-3" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border/60 px-3 py-1.5 text-[10.5px] font-mono text-muted-foreground">
        <span className="truncate">{data?.path || "—"}</span>
        <span>
          {filtered.length} item{filtered.length === 1 ? "" : "s"}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </span>
      </div>

      {/* Drop overlay */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-primary bg-background/80 px-8 py-6 text-center">
            <FolderOpen className="mx-auto h-8 w-8 text-primary" />
            <div className="mt-2 text-sm font-medium">
              Drop to {side === "local" ? "download here" : "upload here"}
            </div>
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">{data?.path}</div>
          </div>
        </div>
      )}
    </div>
  );
}
