import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";

export async function listLocal(dirPath) {
  const abs = !dirPath || dirPath === "~"
    ? os.homedir()
    : dirPath.startsWith("~")
    ? path.join(os.homedir(), dirPath.slice(1))
    : path.resolve(dirPath);

  const items = await fs.readdir(abs, { withFileTypes: true });
  const entries = await Promise.all(
    items.map(async (d) => {
      const full = path.join(abs, d.name);
      let stat;
      try { stat = await fs.stat(full); } catch { stat = null; }
      return {
        name: d.name,
        path: full,
        type: d.isDirectory() ? "directory" : d.isSymbolicLink() ? "symlink" : "file",
        size: stat?.size ?? 0,
        mtime: stat?.mtimeMs ?? 0,
      };
    })
  );
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { path: abs, entries, home: os.homedir(), separator: path.sep };
}

export async function deleteLocal(targetPath) {
  const stat = await fs.stat(targetPath);
  if (stat.isDirectory()) await fs.rm(targetPath, { recursive: true, force: true });
  else await fs.unlink(targetPath);
  return true;
}

export async function renameLocal(from, to) {
  await fs.rename(from, to);
  return true;
}

export async function mkdirLocal(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
  return true;
}

export function homeInfo() {
  return { home: os.homedir(), cwd: process.cwd(), separator: path.sep, platform: process.platform };
}
