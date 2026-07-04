import { useEffect, useState, useMemo, useRef } from "react";
import {
  Folder,
  FolderOpen,
  File as FileIcon,
  ChevronRight,
  Home,
  RotateCw,
  ArrowUp,
  Search,
  Loader2,
  AlertCircle,
  Upload,
  Download,
  HardDrive,
  Cloud,
  Pencil,
  Trash2,
  FolderPlus,
  Bookmark,
  SearchCheck,
  Shield,
  Terminal,
  GitCompare,
  KeyRound,
  RotateCcw,
  Settings2,
} from "lucide-react";
import {
  api,
  type Bookmark as BookmarkEntry,
  type FileEntry,
  type TransferOptions,
  type TransferPreset,
} from "@/lib/agent";
import { formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Side = "local" | "remote";

interface Props {
  side: Side;
  serverId?: string | null;
  onTransfer: (file: FileEntry) => void;
  onDropFiles: (paths: string[], destinationPath?: string) => void;
  onPathChange?: (path: string) => void;
  peerPath?: string;
  dragBusy?: boolean;
}

type DialogOption = {
  label: string;
  value: string;
  description?: string;
};

type DialogRequest =
  | {
      kind: "input";
      title: string;
      description?: string;
      defaultValue?: string;
      placeholder?: string;
      multiline?: boolean;
      confirmLabel?: string;
      resolve: (value: string | null) => void;
    }
  | {
      kind: "confirm";
      title: string;
      description?: string;
      confirmLabel?: string;
      destructive?: boolean;
      resolve: (value: boolean) => void;
    }
  | {
      kind: "message";
      title: string;
      description?: string;
      content?: string;
      resolve: () => void;
    }
  | {
      kind: "select";
      title: string;
      description?: string;
      options: DialogOption[];
      resolve: (value: string | null) => void;
    };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function FileExplorer({
  side,
  serverId,
  onTransfer,
  onDropFiles,
  onPathChange,
  peerPath,
  dragBusy,
}: Props) {
  const [path, setPath] = useState<string>(side === "local" ? "~" : ".");
  const [data, setData] = useState<{ path: string; entries: FileEntry[]; error?: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [presets, setPresets] = useState<TransferPreset[]>([]);
  const [terminalResult, setTerminalResult] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [rowDropTarget, setRowDropTarget] = useState<string | null>(null);
  const loadRequestId = useRef(0);

  const separator = side === "remote" ? "/" : data?.path?.includes("\\") ? "\\" : "/";

  const load = async (p: string) => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setSelected(new Set());
    try {
      const res =
        side === "local"
          ? await api.listLocal(p)
          : serverId
            ? await api.listRemote(serverId, p)
            : { path: p, entries: [], error: "No server selected" };
      if (requestId !== loadRequestId.current) return;
      setData(res);
      setPath(res.path);
      onPathChange?.(res.path);
    } catch (e: unknown) {
      if (requestId !== loadRequestId.current) return;
      setData({ path: p, entries: [], error: getErrorMessage(e, "Failed to list") });
      onPathChange?.(p);
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (side === "remote" && !serverId) {
      setData({ path: "", entries: [], error: "Select a server to browse" });
      onPathChange?.("");
      return;
    }
    load(side === "local" ? "~" : ".");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, serverId]);

  useEffect(() => {
    api
      .bookmarks(serverId)
      .then(setBookmarks)
      .catch(() => setBookmarks([]));
    api
      .presets()
      .then(setPresets)
      .catch(() => setPresets([]));
  }, [serverId]);

  const selectedEntries = useMemo(() => {
    if (!data) return [];
    return data.entries.filter((entry) => selected.has(entry.path));
  }, [data, selected]);

  const primarySelection = selectedEntries[0] || null;

  const askInput = (request: Omit<Extract<DialogRequest, { kind: "input" }>, "kind" | "resolve">) =>
    new Promise<string | null>((resolve) => setDialog({ kind: "input", ...request, resolve }));

  const askConfirm = (
    request: Omit<Extract<DialogRequest, { kind: "confirm" }>, "kind" | "resolve">,
  ) => new Promise<boolean>((resolve) => setDialog({ kind: "confirm", ...request, resolve }));

  const askSelect = (
    request: Omit<Extract<DialogRequest, { kind: "select" }>, "kind" | "resolve">,
  ) => new Promise<string | null>((resolve) => setDialog({ kind: "select", ...request, resolve }));

  const showMessage = (
    request: Omit<Extract<DialogRequest, { kind: "message" }>, "kind" | "resolve">,
  ) =>
    new Promise<void>((resolve) =>
      setDialog({
        kind: "message",
        ...request,
        resolve,
      }),
    );

  const handleRename = async (entry: FileEntry) => {
    const newName = await askInput({
      title: "Rename",
      description: `Rename "${entry.name}" to:`,
      defaultValue: entry.name,
      confirmLabel: "Rename",
    });
    if (!newName || newName === entry.name) return;
    const idx = entry.path.lastIndexOf(separator);
    const parentPath = idx === -1 ? "." : entry.path.slice(0, idx);
    const newPath = parentPath + separator + newName;
    try {
      if (side === "local") {
        await api.renameLocal(entry.path, newPath);
      } else if (serverId) {
        await api.renameRemote(serverId, entry.path, newPath);
      }
      load(path);
    } catch (err: unknown) {
      showMessage({ title: "Rename Failed", content: getErrorMessage(err, "Unknown error") });
    }
  };

  const handleDelete = async (entry: FileEntry) => {
    const confirmed = await askConfirm({
      title: "Delete Item",
      description: `Delete this ${entry.type}: "${entry.name}"?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      if (side === "local") {
        await api.deleteLocal(entry.path);
      } else if (serverId) {
        await api.deleteRemote(serverId, entry.path);
      }
      load(path);
    } catch (err: unknown) {
      showMessage({ title: "Delete Failed", content: getErrorMessage(err, "Unknown error") });
    }
  };

  const handleSafeDelete = async () => {
    if (side !== "remote" || !serverId || !primarySelection) return;
    const confirmed = await askConfirm({
      title: "Move To Trash",
      description: `Move "${primarySelection.name}" to remote trash?`,
      confirmLabel: "Move To Trash",
    });
    if (!confirmed) return;
    try {
      const result = await api.safeDeleteRemote(serverId, primarySelection.path);
      showMessage({ title: "Moved To Trash", content: result.path });
      load(path);
    } catch (err: unknown) {
      showMessage({ title: "Safe Delete Failed", content: getErrorMessage(err, "Unknown error") });
    }
  };

  const handleRestore = async () => {
    if (side !== "remote" || !serverId) return;
    const from = await askInput({
      title: "Restore From Trash",
      description: "Enter the trash path to restore.",
      placeholder: "~/.ssh-bridge-trash/...",
    });
    if (!from) return;
    const to = await askInput({
      title: "Restore Destination",
      description: "Choose where the item should be restored.",
      defaultValue: path + (path.endsWith("/") ? "" : "/") + from.split("/").pop(),
    });
    if (!to) return;
    try {
      await api.restoreRemote(serverId, from, to);
      load(path);
    } catch (err: unknown) {
      showMessage({ title: "Restore Failed", content: getErrorMessage(err, "Unknown error") });
    }
  };

  const handleChmod = async () => {
    if (side !== "remote" || !serverId || !primarySelection) return;
    const mode = await askInput({
      title: "Edit Permissions",
      description: `chmod mode for "${primarySelection.name}"`,
      defaultValue: "755",
      placeholder: "755",
      confirmLabel: "Apply",
    });
    if (!mode) return;
    try {
      await api.chmodRemote(serverId, primarySelection.path, mode);
      load(path);
    } catch (err: unknown) {
      showMessage({
        title: "Permission Update Failed",
        content: getErrorMessage(err, "Unknown error"),
      });
    }
  };

  const handleMkdir = async () => {
    const name = await askInput({
      title: "New Folder",
      description: "Create a folder in the current path.",
      placeholder: "folder-name",
      confirmLabel: "Create",
    });
    if (!name) return;
    const newPath = path + (path.endsWith(separator) ? "" : separator) + name;
    try {
      if (side === "local") {
        await api.mkdirLocal(newPath);
      } else if (serverId) {
        await api.mkdirRemote(serverId, newPath);
      }
      load(path);
    } catch (err: unknown) {
      showMessage({
        title: "Create Folder Failed",
        content: getErrorMessage(err, "Unknown error"),
      });
    }
  };

  const goUp = () => {
    if (!data?.path) return;
    const parts = data.path.split(separator).filter(Boolean);
    if (parts.length === 0) return;
    parts.pop();
    const parent = separator === "/" ? "/" + parts.join("/") : parts.join("\\") + "\\";
    load(parent || "/");
  };

  const goHome = () => load(side === "local" ? "~" : ".");

  const saveBookmark = async () => {
    const name = await askInput({
      title: "Save Bookmark",
      description: "Name this location for quick access.",
      defaultValue: path.split(separator).filter(Boolean).pop() || path,
      confirmLabel: "Save",
    });
    if (!name) return;
    try {
      const bookmark = await api.saveBookmark({
        serverId: side === "remote" ? serverId || null : null,
        side,
        name,
        path,
      });
      setBookmarks((current) => [bookmark, ...current.filter((b) => b.id !== bookmark.id)]);
    } catch (err: unknown) {
      showMessage({ title: "Bookmark Failed", content: getErrorMessage(err, "Unknown error") });
    }
  };

  const openBookmark = async () => {
    const scoped = bookmarks.filter((b) => b.side === side);
    if (scoped.length === 0) {
      showMessage({
        title: "No Bookmarks",
        description: "No bookmarks saved for this panel yet.",
      });
      return;
    }
    const choice = await askSelect({
      title: "Open Bookmark",
      description: "Choose a saved location.",
      options: scoped.map((b) => ({ label: b.name, value: b.id, description: b.path })),
    });
    const bookmark = scoped.find((b) => b.id === choice);
    if (bookmark) load(bookmark.path);
  };

  const handleRecursiveSearch = async () => {
    const q = await askInput({
      title: "Recursive Search",
      description: `Search ${label.toLowerCase()} files by name.`,
      placeholder: "filename",
      confirmLabel: "Search",
    });
    if (!q) return;
    try {
      const result =
        side === "local"
          ? await api.searchLocal(path, q)
          : serverId
            ? await api.searchRemote(serverId, path, q)
            : { entries: [] };
      showMessage({
        title: "Search Results",
        description: result.entries.length
          ? `${result.entries.length} matches found.`
          : "No matches found.",
        content: result.entries.join("\n"),
      });
    } catch (err: unknown) {
      showMessage({ title: "Search Failed", content: getErrorMessage(err, "Unknown error") });
    }
  };

  const transferTargetFor = (entry: FileEntry) => {
    const base = peerPath || (side === "local" ? "." : "~");
    return (
      base +
      (base.endsWith(separator) || base.endsWith("/") ? "" : side === "local" ? "/" : separator) +
      entry.name
    );
  };

  const chooseTransferOptions = async (): Promise<TransferOptions | null> => {
    if (presets.length > 0) {
      const selectedPreset = await askSelect({
        title: "Transfer Preset",
        description: "Choose a saved preset, or choose Custom.",
        options: [
          {
            label: "Custom",
            value: "__custom__",
            description: "Choose conflict policy and bandwidth now.",
          },
          ...presets.map((preset) => ({
            label: preset.name,
            value: preset.id,
            description: JSON.stringify(preset.options),
          })),
        ],
      });
      if (!selectedPreset) return null;
      if (selectedPreset !== "__custom__") {
        const preset = presets.find((p) => p.id === selectedPreset);
        if (preset) return preset.options;
      }
    }
    const conflict = await askSelect({
      title: "Conflict Policy",
      description: "Choose what happens when the destination already has a file.",
      options: [
        {
          label: "Newer Only",
          value: "newer",
          description: "Skip files that are newer on destination.",
        },
        { label: "Skip Existing", value: "skip", description: "Never overwrite existing files." },
        { label: "Overwrite", value: "overwrite", description: "Replace destination files." },
        {
          label: "Rename Backup",
          value: "rename",
          description: "Keep backups with .ssh-bridge-backup suffix.",
        },
      ],
    });
    if (!conflict) return null;

    const inplace = await askConfirm({
      title: "Write In-Place?",
      description: "Write data directly to target files. Highly recommended for very large files (like movies) to save disk space and run faster.",
      confirmLabel: "Yes, Write In-Place (Faster)",
    });

    const wholeFile = await askConfirm({
      title: "Whole File Transfer?",
      description: "Skip the rsync delta-algorithm and transfer files wholesale. Highly recommended for high-speed local networks (LAN).",
      confirmLabel: "Yes, Whole File (LAN Optimized)",
    });

    const compress = await askConfirm({
      title: "Enable Compression?",
      description: "Compress files during transfer. Good for text/logs, but wastes CPU for movies/archives.",
      confirmLabel: "Yes, Compress (Slow Networks)",
    });

    const bwlimit = await askInput({
      title: "Bandwidth Limit",
      description: "Optional KB/s limit. Leave blank for unlimited.",
      placeholder: "5000",
      confirmLabel: "Continue",
    });
    return {
      conflict: conflict as TransferOptions["conflict"],
      bwlimit: bwlimit ? Number(bwlimit) : undefined,
      backup: conflict === "rename",
      inplace,
      wholeFile,
      compress,
    };
  };

  const saveTransferPreset = async () => {
    const name = await askInput({
      title: "Save Transfer Preset",
      description: "Name this transfer behavior.",
      defaultValue: "Production safe sync",
      confirmLabel: "Next",
    });
    if (!name) return;
    const options = await chooseTransferOptions();
    if (!options) return;
    try {
      const preset = await api.savePreset({ name, options });
      setPresets((current) => [preset, ...current.filter((p) => p.id !== preset.id)]);
    } catch (err: unknown) {
      showMessage({ title: "Preset Failed", content: getErrorMessage(err, "Unknown error") });
    }
  };

  const handlePremiumTransfer = async () => {
    if (!serverId || !primarySelection) return;
    const options = await chooseTransferOptions();
    if (!options) return;
    try {
      await api.startTransfer({
        serverId,
        direction: side === "local" ? "upload" : "download",
        localPath: side === "local" ? primarySelection.path : transferTargetFor(primarySelection),
        remotePath: side === "local" ? transferTargetFor(primarySelection) : primarySelection.path,
        options,
      });
    } catch (err: unknown) {
      showMessage({ title: "Transfer Failed", content: getErrorMessage(err, "Unknown error") });
    }
  };

  const handleDryRun = async () => {
    if (!serverId || !primarySelection) return;
    const options = await chooseTransferOptions();
    if (!options) return;
    try {
      const preview = await api.dryRunTransfer({
        serverId,
        direction: side === "local" ? "upload" : "download",
        localPath: side === "local" ? primarySelection.path : transferTargetFor(primarySelection),
        remotePath: side === "local" ? transferTargetFor(primarySelection) : primarySelection.path,
        options,
      });
      showMessage({
        title: "Dry Run Preview",
        description: preview.changes.length
          ? `${preview.changes.length} changes detected.`
          : "No changes detected.",
        content: preview.changes.slice(0, 120).join("\n"),
      });
    } catch (err: unknown) {
      showMessage({ title: "Dry Run Failed", content: getErrorMessage(err, "Unknown error") });
    }
  };

  const handleCompare = async () => {
    if (!serverId || !peerPath) return;
    try {
      const [local, remote] = await Promise.all([
        api.listLocal(side === "local" ? path : peerPath),
        api.listRemote(serverId, side === "remote" ? path : peerPath),
      ]);
      const localNames = new Map(local.entries.map((e) => [e.name, e]));
      const remoteNames = new Map(remote.entries.map((e) => [e.name, e]));
      const onlyLocal = [...localNames.keys()].filter((name) => !remoteNames.has(name));
      const onlyRemote = [...remoteNames.keys()].filter((name) => !localNames.has(name));
      const changed = [...localNames.values()].filter((entry) => {
        const peer = remoteNames.get(entry.name);
        return peer && entry.type === "file" && peer.type === "file" && entry.size !== peer.size;
      });
      showMessage({
        title: "Folder Compare",
        content: [
          `Only local: ${onlyLocal.length}`,
          ...onlyLocal.slice(0, 20).map((name) => `  ${name}`),
          `Only remote: ${onlyRemote.length}`,
          ...onlyRemote.slice(0, 20).map((name) => `  ${name}`),
          `Different size: ${changed.length}`,
          ...changed.slice(0, 20).map((entry) => `  ${entry.name}`),
        ].join("\n"),
      });
    } catch (err: unknown) {
      showMessage({ title: "Compare Failed", content: getErrorMessage(err, "Unknown error") });
    }
  };

  const handleTerminal = async () => {
    if (side !== "remote" || !serverId) return;
    const command = await askInput({
      title: "Remote Terminal",
      description: `Run a command in ${path}.`,
      defaultValue: "pwd && ls -la",
      multiline: true,
      confirmLabel: "Run",
    });
    if (!command) return;
    try {
      const result = await api.terminal(serverId, path, command);
      setTerminalResult(
        `$ ${command}\n\n${result.stdout}${result.stderr ? `\nERR:\n${result.stderr}` : ""}`,
      );
    } catch (err: unknown) {
      setTerminalResult(`Command failed: ${getErrorMessage(err, "Unknown error")}`);
    }
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const visibleEntries = data.entries.filter((e) => !e.name.startsWith("."));
    if (!query) return visibleEntries;
    const q = query.toLowerCase();
    return visibleEntries.filter((e) => e.name.toLowerCase().includes(q));
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
    void handleDropToPath(e, path, true);
  };

  const handleDropToPath = async (
    e: React.DragEvent,
    destinationPath: string,
    shouldAskDestination: boolean,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    setRowDropTarget(null);
    const raw = e.dataTransfer.getData("application/x-ssh-bridge");
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (payload.side === side) return; // same side, ignore
    const finalDestination = shouldAskDestination
      ? await askInput({
          title: `Choose ${label} Destination`,
          description: "Drop into this path, or edit it before starting the transfer.",
          defaultValue: destinationPath,
          confirmLabel: "Start Transfer",
        })
      : destinationPath;
    if (!finalDestination) return;
    onDropFiles(payload.paths, finalDestination);
  };

  const Icon = side === "local" ? HardDrive : Cloud;
  const label = side === "local" ? "Local" : "Remote";

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl glass",
        dragOver && "ring-2 ring-primary shadow-glow",
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
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md",
            side === "local" ? "bg-surface-3 text-foreground" : "bg-primary/15 text-primary",
          )}
        >
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
          {(side === "local" || serverId) && (
            <button
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
              onClick={handleMkdir}
              title="New Folder"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            onClick={saveBookmark}
            title="Save Bookmark"
          >
            <Bookmark className="h-3.5 w-3.5" />
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            onClick={openBookmark}
            title="Open Bookmark"
          >
            <RotateCcw className="h-3.5 w-3.5" />
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

      <div className="flex items-center gap-1 border-b border-border/60 px-3 py-1.5">
        <ToolButton icon={SearchCheck} title="Recursive Search" onClick={handleRecursiveSearch} />
        <ToolButton
          icon={GitCompare}
          title="Compare Local/Remote"
          onClick={handleCompare}
          disabled={!serverId || !peerPath}
        />
        <ToolButton
          icon={Shield}
          title="Dry Run Preview"
          onClick={handleDryRun}
          disabled={!serverId || !primarySelection}
        />
        <ToolButton
          icon={Settings2}
          title="Transfer With Conflict Policy"
          onClick={handlePremiumTransfer}
          disabled={!serverId || !primarySelection}
        />
        <ToolButton icon={Bookmark} title="Save Transfer Preset" onClick={saveTransferPreset} />
        {side === "remote" && (
          <>
            <ToolButton
              icon={KeyRound}
              title="Edit Permissions"
              onClick={handleChmod}
              disabled={!serverId || !primarySelection}
            />
            <ToolButton
              icon={Trash2}
              title="Safe Delete"
              onClick={handleSafeDelete}
              disabled={!serverId || !primarySelection}
            />
            <ToolButton
              icon={RotateCcw}
              title="Restore From Trash"
              onClick={handleRestore}
              disabled={!serverId}
            />
            <ToolButton
              icon={Terminal}
              title="Terminal Command"
              onClick={handleTerminal}
              disabled={!serverId}
            />
          </>
        )}
      </div>

      {terminalResult && (
        <div className="border-b border-border/60 bg-background/70 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Terminal
            </span>
            <button
              className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              onClick={() => setTerminalResult(null)}
            >
              Close
            </button>
          </div>
          <pre className="scrollbar-thin max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-surface p-2 font-mono text-[11px] text-foreground">
            {terminalResult}
          </pre>
        </div>
      )}

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
                <th className="hidden w-40 px-3 py-1.5 text-right font-medium md:table-cell">
                  Modified
                </th>
                <th className="w-24" />
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
                    onDragOver={(e) => {
                      if (
                        entry.type === "directory" &&
                        e.dataTransfer.types.includes("application/x-ssh-bridge")
                      ) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = "copy";
                        setRowDropTarget(entry.path);
                      }
                    }}
                    onDragLeave={() => {
                      if (rowDropTarget === entry.path) setRowDropTarget(null);
                    }}
                    onDrop={(e) => {
                      if (entry.type === "directory") {
                        void handleDropToPath(e, entry.path, false);
                      }
                    }}
                    onClick={(e) => {
                      const next = new Set(e.metaKey || e.ctrlKey ? selected : []);
                      if (isSelected && (e.metaKey || e.ctrlKey)) next.delete(entry.path);
                      else next.add(entry.path);
                      setSelected(next);
                    }}
                    onDoubleClick={() => handleDoubleClick(entry)}
                    className={cn(
                      "group cursor-pointer border-b border-border/30 transition",
                      rowDropTarget === entry.path
                        ? "bg-primary/20 ring-1 ring-inset ring-primary/50"
                        : isSelected
                          ? "bg-primary/10"
                          : "hover:bg-surface-2/60",
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
                      <div className="flex items-center gap-1">
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRename(entry);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-surface-3 hover:text-foreground"
                          title="Rename"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(entry);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
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
      {dialog && <ExplorerDialog dialog={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

function ToolButton({
  icon: Icon,
  title,
  onClick,
  disabled = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function ExplorerDialog({ dialog, onClose }: { dialog: DialogRequest; onClose: () => void }) {
  const [value, setValue] = useState(dialog.kind === "input" ? dialog.defaultValue || "" : "");

  const close = () => {
    if (dialog.kind === "input" || dialog.kind === "select") dialog.resolve(null);
    if (dialog.kind === "confirm") dialog.resolve(false);
    if (dialog.kind === "message") dialog.resolve();
    onClose();
  };

  const confirm = () => {
    if (dialog.kind === "input") dialog.resolve(value);
    if (dialog.kind === "confirm") dialog.resolve(true);
    if (dialog.kind === "message") dialog.resolve();
    onClose();
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="glass-strong w-full max-w-lg overflow-hidden rounded-xl shadow-elevated">
        <div className="border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">{dialog.title}</div>
          {dialog.description && (
            <div className="mt-1 text-xs text-muted-foreground">{dialog.description}</div>
          )}
        </div>

        <div className="max-h-[48vh] overflow-y-auto p-4">
          {dialog.kind === "input" &&
            (dialog.multiline ? (
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={dialog.placeholder}
                rows={6}
                className="scrollbar-thin w-full resize-none rounded-md border border-input bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                autoFocus
              />
            ) : (
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={dialog.placeholder}
                className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                autoFocus
              />
            ))}

          {dialog.kind === "select" && (
            <div className="space-y-2">
              {dialog.options.map((option) => (
                <button
                  key={option.value}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-left transition hover:border-primary/50 hover:bg-surface-2"
                  onClick={() => {
                    dialog.resolve(option.value);
                    onClose();
                  }}
                >
                  <div className="text-sm font-medium text-foreground">{option.label}</div>
                  {option.description && (
                    <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
                      {option.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {dialog.kind === "message" && dialog.content && (
            <pre className="scrollbar-thin max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-surface p-3 font-mono text-[11px] text-foreground">
              {dialog.content}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          {dialog.kind !== "message" && (
            <button
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              onClick={close}
            >
              Cancel
            </button>
          )}
          {dialog.kind !== "select" && (
            <button
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition",
                dialog.kind === "confirm" && dialog.destructive
                  ? "bg-destructive text-destructive-foreground hover:brightness-110"
                  : "bg-primary text-primary-foreground hover:brightness-110",
              )}
              onClick={confirm}
            >
              {dialog.kind === "message" ? "Close" : dialog.confirmLabel || "Continue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
