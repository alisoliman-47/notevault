import path from "node:path";

/** Normalize to forward slashes, no leading slash, relative to vault root. */
export function normalizeVaultPath(p: string): string {
  let s = p.trim().replace(/\\/g, "/");
  while (s.startsWith("/")) s = s.slice(1);
  const parts = s.split("/").filter(Boolean);
  const safe: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") throw new Error("Invalid path: path traversal");
    safe.push(part);
  }
  return safe.join("/");
}

export function ensureMdExtension(rel: string): string {
  const n = normalizeVaultPath(rel);
  if (n.toLowerCase().endsWith(".md")) return n;
  return `${n}.md`;
}

export function toFsPath(vaultRoot: string, rel: string): string {
  const n = normalizeVaultPath(rel);
  return path.join(vaultRoot, ...n.split("/"));
}
