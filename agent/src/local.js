import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";

function isVisibleEntry(name) {
  return name !== "." && name !== ".." && !name.startsWith(".");
}

function sortEntries(a, b) {
  if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

export async function listLocal(dirPath) {
  const abs =
    !dirPath || dirPath === "~"
      ? os.homedir()
      : dirPath.startsWith("~")
        ? path.join(os.homedir(), dirPath.slice(1))
        : path.resolve(dirPath);

  const items = await fs.readdir(abs, { withFileTypes: true });
  const entries = await Promise.all(
    items
      .filter((d) => isVisibleEntry(d.name))
      .map(async (d) => {
        const full = path.join(abs, d.name);
        let stat;
        try {
          stat = await fs.stat(full);
        } catch {
          stat = null;
        }
        return {
          name: d.name,
          path: full,
          type: d.isDirectory() ? "directory" : d.isSymbolicLink() ? "symlink" : "file",
          size: stat?.size ?? 0,
          mtime: stat?.mtimeMs ?? 0,
        };
      }),
  );
  entries.sort(sortEntries);
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

export async function searchLocal(rootPath, query) {
  if (!query || String(query).trim().length < 1) return { root: rootPath, entries: [] };
  const root = rootPath || os.homedir();
  const found = [];
  const needle = String(query).toLowerCase();

  async function walk(dir) {
    if (found.length >= 200) return;
    let items = [];
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (!isVisibleEntry(item.name)) continue;
      const full = path.join(dir, item.name);
      if (item.name.toLowerCase().includes(needle)) found.push(full);
      if (item.isDirectory()) await walk(full);
      if (found.length >= 200) return;
    }
  }

  await walk(root);
  return { root, entries: found };
}

export function homeInfo() {
  return {
    home: os.homedir(),
    cwd: process.cwd(),
    separator: path.sep,
    platform: process.platform,
  };
}
