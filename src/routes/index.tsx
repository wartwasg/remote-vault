import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ServerSidebar } from "@/components/ServerSidebar";
import { TopBar } from "@/components/TopBar";
import { FileExplorer } from "@/components/FileExplorer";
import { TransferPanel } from "@/components/TransferPanel";
import { ServerDialog } from "@/components/ServerDialog";
import { AgentOfflineBanner } from "@/components/AgentOfflineBanner";
import { useServers, refresh as refreshServers } from "@/hooks/useServers";
import { useTransfers } from "@/hooks/useTransfers";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { api, type FileEntry, type ServerInfo } from "@/lib/agent";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SSH Bridge — Visual SSH + Rsync file manager" },
      {
        name: "description",
        content:
          "A premium GUI for SSH and rsync. Browse remote servers, drag and drop files, and track transfers in real time — no terminal required.",
      },
      { property: "og:title", content: "SSH Bridge" },
      {
        property: "og:description",
        content: "Visual SSH + rsync file manager. Dropbox-level UX, DevOps power.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { servers } = useServers();
  const status = useAgentStatus();
  const transfers = useTransfers();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServerInfo | null>(null);
  const [deleting, setDeleting] = useState<ServerInfo | null>(null);
  const [localPath, setLocalPath] = useState<string>("");
  const [remotePath, setRemotePath] = useState<string>("");

  useEffect(() => {
    if (!activeId && servers.length > 0) setActiveId(servers[0].id);
  }, [servers, activeId]);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (s: ServerInfo) => {
    setEditing(s);
    setDialogOpen(true);
  };
  const del = async (s: ServerInfo) => {
    setDeleting(s);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await api.deleteServer(deleting.id);
    await refreshServers();
    if (activeId === deleting.id) setActiveId(null);
    setDeleting(null);
  };

  // Called when user clicks the transfer icon on a single file
  const quickTransfer = async (side: "local" | "remote", entry: FileEntry) => {
    if (!activeId) return;
    if (side === "local") {
      await api.startTransfer({
        serverId: activeId,
        direction: "upload",
        localPath: entry.path,
        remotePath: joinPath(remotePath || ".", entry.name, "/"),
      });
    } else {
      await api.startTransfer({
        serverId: activeId,
        direction: "download",
        localPath: joinPath(localPath || "~", entry.name, "/"),
        remotePath: entry.path,
      });
    }
  };

  // Drag & drop between panels — start a real rsync
  const onDrop = async (
    targetSide: "local" | "remote",
    sourcePaths: string[],
    destinationPath?: string,
  ) => {
    if (!activeId) return;
    for (const src of sourcePaths) {
      const name = src.split(/[/\\]/).pop() || "file";
      if (targetSide === "remote") {
        const dest = joinPath(destinationPath || remotePath || ".", name, "/");
        await api.startTransfer({
          serverId: activeId,
          direction: "upload",
          localPath: src,
          remotePath: dest,
        });
      } else {
        const dest = joinPath(destinationPath || localPath || "~", name, "/");
        await api.startTransfer({
          serverId: activeId,
          direction: "download",
          localPath: dest,
          remotePath: src,
        });
      }
    }
  };

  if (status && !status.ok) {
    return (
      <div className="flex h-screen w-full">
        <ServerSidebar
          servers={servers}
          activeId={activeId}
          onSelect={setActiveId}
          onAdd={openAdd}
          onEdit={openEdit}
          onDelete={del}
        />
        <AgentOfflineBanner />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full">
      <ServerSidebar
        servers={servers}
        activeId={activeId}
        onSelect={setActiveId}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={del}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar servers={servers} activeId={activeId} onSelect={setActiveId} />

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-3 p-3 lg:grid-cols-2">
          <div className="flex min-h-0 min-w-0 flex-col">
            <FileExplorer
              side="local"
              serverId={activeId}
              onTransfer={(e) => quickTransfer("local", e)}
              onDropFiles={(paths, destinationPath) => onDrop("local", paths, destinationPath)}
              onPathChange={setLocalPath}
              peerPath={remotePath}
            />
          </div>
          <div className="flex min-h-0 min-w-0 flex-col">
            <FileExplorer
              side="remote"
              serverId={activeId}
              onTransfer={(e) => quickTransfer("remote", e)}
              onDropFiles={(paths, destinationPath) => onDrop("remote", paths, destinationPath)}
              onPathChange={setRemotePath}
              peerPath={localPath}
            />
          </div>
        </div>

        <div className="px-3 pb-3">
          <TransferPanel transfers={transfers} />
        </div>
      </main>

      <ServerDialog
        open={dialogOpen}
        editing={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={refreshServers}
      />
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="glass-strong w-full max-w-md overflow-hidden rounded-xl shadow-elevated">
            <div className="border-b border-border px-4 py-3">
              <div className="text-sm font-semibold">Delete Server</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Remove "{deleting.name}" from this workspace? Saved credentials for this server will
                be removed locally.
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3">
              <button
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                onClick={() => setDeleting(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:brightness-110"
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function joinPath(base: string, name: string, sep: string) {
  if (base.endsWith(sep)) return base + name;
  return base + sep + name;
}
