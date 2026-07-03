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
  const [localPath, setLocalPath] = useState<string>("");
  const [remotePath, setRemotePath] = useState<string>("");

  useEffect(() => {
    if (!activeId && servers.length > 0) setActiveId(servers[0].id);
  }, [servers, activeId]);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (s: ServerInfo) => { setEditing(s); setDialogOpen(true); };
  const del = async (s: ServerInfo) => {
    if (!confirm(`Delete server "${s.name}"?`)) return;
    await api.deleteServer(s.id);
    await refreshServers();
    if (activeId === s.id) setActiveId(null);
  };

  // Called when user clicks the transfer icon on a single file
  const quickTransfer = async (side: "local" | "remote", entry: FileEntry) => {
    if (!activeId) {
      alert("Select a server first");
      return;
    }
    if (side === "local") {
      const dest = prompt("Upload to remote path:", remotePath || `/root/${entry.name}`);
      if (!dest) return;
      await api.startTransfer({
        serverId: activeId,
        direction: "upload",
        localPath: entry.path,
        remotePath: dest,
      });
    } else {
      const dest = prompt("Download to local path:", `${localPath || "~"}/${entry.name}`);
      if (!dest) return;
      await api.startTransfer({
        serverId: activeId,
        direction: "download",
        localPath: dest,
        remotePath: entry.path,
      });
    }
  };

  // Drag & drop between panels — start a real rsync
  const onDrop = async (targetSide: "local" | "remote", sourcePaths: string[]) => {
    if (!activeId) return;
    for (const src of sourcePaths) {
      const name = src.split(/[/\\]/).pop() || "file";
      if (targetSide === "remote") {
        // Local -> Remote (upload). Destination = current remotePath / name
        const dest = joinPath(remotePath || ".", name, "/");
        await api.startTransfer({
          serverId: activeId,
          direction: "upload",
          localPath: src,
          remotePath: dest,
        });
      } else {
        const dest = joinPath(localPath || "~", name, "/");
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
          <ExplorerWrap onPath={setLocalPath}>
            <FileExplorer
              side="local"
              onTransfer={(e) => quickTransfer("local", e)}
              onDropFiles={(paths) => onDrop("local", paths)}
            />
          </ExplorerWrap>
          <ExplorerWrap onPath={setRemotePath}>
            <FileExplorer
              side="remote"
              serverId={activeId}
              onTransfer={(e) => quickTransfer("remote", e)}
              onDropFiles={(paths) => onDrop("remote", paths)}
            />
          </ExplorerWrap>
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
    </div>
  );
}

function ExplorerWrap({
  children, onPath,
}: {
  children: React.ReactNode;
  onPath: (p: string) => void;
}) {
  // Just a passthrough for now — path tracking wired through FileExplorer footer would be
  // cleaner, but this keeps the parent unaware of internal state.
  return <div className="flex min-h-0 min-w-0 flex-col">{children}</div>;
}

function joinPath(base: string, name: string, sep: string) {
  if (base.endsWith(sep)) return base + name;
  return base + sep + name;
}
