import { useState } from "react";
import { X, Loader2, Check, AlertCircle } from "lucide-react";
import { api } from "@/lib/agent";
import type { ServerInfo } from "@/lib/agent";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  editing: ServerInfo | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ServerDialog({ open, editing, onClose, onSaved }: Props) {
  const [name, setName] = useState(editing?.name || "");
  const [host, setHost] = useState(editing?.host || "");
  const [port, setPort] = useState(String(editing?.port || 22));
  const [username, setUsername] = useState(editing?.username || "");
  const [authType, setAuthType] = useState<"password" | "key">(editing?.authType || "key");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [keyPath, setKeyPath] = useState(editing?.keyPath || "~/.ssh/id_rsa");
  const [passphrase, setPassphrase] = useState("");
  const [useKeyPath, setUseKeyPath] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const payload = () => ({
    id: editing?.id,
    name: name || host,
    host,
    port: Number(port) || 22,
    username,
    authType,
    ...(authType === "password"
      ? { password }
      : useKeyPath
      ? { keyPath, passphrase: passphrase || undefined }
      : { privateKey, passphrase: passphrase || undefined }),
  });

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.testServer(payload());
      setTestResult(r);
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.saveServer(payload());
      onSaved();
      onClose();
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="glass-strong w-full max-w-lg overflow-hidden rounded-2xl shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-base font-semibold">{editing ? "Edit server" : "New SSH server"}</div>
            <div className="text-xs text-muted-foreground">
              Credentials are encrypted locally with AES-256-GCM.
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scrollbar-thin max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <Field label="Name">
            <Input value={name} onChange={setName} placeholder="Production Web Server" />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Host">
                <Input value={host} onChange={setHost} placeholder="192.168.1.10 or example.com" mono />
              </Field>
            </div>
            <Field label="Port">
              <Input value={port} onChange={setPort} placeholder="22" mono />
            </Field>
          </div>

          <Field label="Username">
            <Input value={username} onChange={setUsername} placeholder="root" mono />
          </Field>

          <Field label="Authentication">
            <div className="grid grid-cols-2 gap-2">
              <TabBtn active={authType === "key"} onClick={() => setAuthType("key")}>
                SSH Key
              </TabBtn>
              <TabBtn active={authType === "password"} onClick={() => setAuthType("password")}>
                Password
              </TabBtn>
            </div>
          </Field>

          {authType === "password" ? (
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={setPassword}
                placeholder={editing?.hasPassword ? "•••••••• (unchanged)" : "Enter password"}
              />
              <div className="mt-1 text-[11px] text-warning">
                Requires <code className="font-mono">sshpass</code> on your system for rsync
                transfers. SSH key auth is strongly recommended.
              </div>
            </Field>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <TabBtn active={useKeyPath} onClick={() => setUseKeyPath(true)}>
                  Path to key file
                </TabBtn>
                <TabBtn active={!useKeyPath} onClick={() => setUseKeyPath(false)}>
                  Paste key
                </TabBtn>
              </div>
              {useKeyPath ? (
                <Field label="Private key path">
                  <Input value={keyPath} onChange={setKeyPath} placeholder="~/.ssh/id_rsa" mono />
                </Field>
              ) : (
                <Field label="Private key">
                  <textarea
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder={
                      editing?.hasKey
                        ? "(existing key stored — leave blank to keep)"
                        : "-----BEGIN OPENSSH PRIVATE KEY-----\n..."
                    }
                    rows={5}
                    className="scrollbar-thin w-full resize-none rounded-lg border border-input bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                  />
                </Field>
              )}
              <Field label="Key passphrase (optional)">
                <Input type="password" value={passphrase} onChange={setPassphrase} placeholder="Leave empty if none" />
              </Field>
            </>
          )}

          {testResult && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                testResult.ok
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              )}
            >
              {testResult.ok ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                {testResult.ok ? (
                  <span>Connection successful.</span>
                ) : (
                  <span className="break-words font-mono text-xs">{testResult.error}</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3.5">
          <button
            onClick={test}
            disabled={testing || !host || !username}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition hover:bg-surface-2 disabled:opacity-50"
          >
            {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Test connection
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !host || !username}
              className="rounded-lg bg-gradient-to-br from-primary to-primary-glow px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Saving..." : editing ? "Save changes" : "Add server"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </label>
  );
}

function Input({
  value, onChange, placeholder, type = "text", mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/30",
        mono && "font-mono"
      )}
    />
  );
}

function TabBtn({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border bg-surface text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
