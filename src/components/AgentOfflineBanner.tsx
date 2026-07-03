import { AlertTriangle, Terminal, Copy } from "lucide-react";
import { useState } from "react";

export function AgentOfflineBanner() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (t: string, key: string) => {
    navigator.clipboard.writeText(t);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="glass-strong w-full max-w-xl rounded-2xl p-7 shadow-elevated">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold">Local agent not running</div>
            <div className="mt-1 text-sm text-muted-foreground">
              SSH Bridge needs its companion agent on <code className="font-mono">127.0.0.1:8787</code>{" "}
              to open SSH sessions and run rsync. Start it from your terminal — one time, then this
              page will connect automatically.
            </div>

            <div className="mt-4 space-y-2">
              {[
                { label: "1. Install dependencies", cmd: "cd agent && npm install" },
                { label: "2. Start the agent", cmd: "npm start" },
              ].map(({ label, cmd }) => (
                <div key={label}>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                  </div>
                  <div className="group flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm">
                    <Terminal className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="flex-1">{cmd}</span>
                    <button
                      onClick={() => copy(cmd, label)}
                      className="opacity-0 transition group-hover:opacity-100"
                    >
                      <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                    {copied === label && <span className="text-[11px] text-success">copied</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 text-[11px] text-muted-foreground">
              Requires <span className="font-mono">rsync</span> and <span className="font-mono">ssh</span> on your
              system (macOS/Linux ship with both). On Windows, use WSL.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
