import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { ensureMdExtension, toFsPath } from "./paths.js";
import { extractWikiTargets, titleFromPath } from "./wiki.js";

export type UpdateMode = "replace" | "append";

export interface NoteMeta {
  path: string;
  title: string;
}

export interface ReadNoteResult {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  raw: string;
}

export interface SearchHit {
  path: string;
  score: number;
  snippet: string;
}

export class VaultService {
  constructor(private vaultRoot = "") {}

  get root(): string {
    return this.vaultRoot;
  }

  async setRoot(newRoot: string): Promise<void> {
    const st = await fs.stat(newRoot).catch(() => null);
    if (!st?.isDirectory()) throw new Error("Vault path must be an existing directory");
    this.vaultRoot = path.resolve(newRoot);
  }

  private assertOpen(): void {
    if (!this.vaultRoot) throw new Error("Open a vault first (pick a folder in the UI)");
  }

  async listNotes(): Promise<NoteMeta[]> {
    this.assertOpen();
    const files = await this.walkMd(this.vaultRoot, "");
    return files
      .map((p) => ({ path: p, title: titleFromPath(p) }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  private async walkMd(dir: string, relPrefix: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const abs = path.join(dir, ent.name);
      const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        out.push(...(await this.walkMd(abs, rel)));
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) {
        out.push(rel.replace(/\\/g, "/"));
      }
    }
    return out;
  }

  async readNote(relPath: string): Promise<ReadNoteResult> {
    this.assertOpen();
    const p = ensureMdExtension(relPath);
    const abs = toFsPath(this.vaultRoot, p);
    const raw = await fs.readFile(abs, "utf8");
    const parsed = matter(raw);
    return {
      path: p,
      content: parsed.content,
      frontmatter: (parsed.data as Record<string, unknown>) ?? {},
      raw,
    };
  }

  async createNote(relPath: string, content: string): Promise<{ path: string }> {
    this.assertOpen();
    const p = ensureMdExtension(relPath);
    const abs = toFsPath(this.vaultRoot, p);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    try {
      await fs.writeFile(abs, content, { flag: "wx" });
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "EEXIST") throw new Error(`Note already exists: ${p}`);
      throw e;
    }
    return { path: p };
  }

  async updateNote(relPath: string, content: string, mode: UpdateMode): Promise<{ path: string }> {
    this.assertOpen();
    const p = ensureMdExtension(relPath);
    const abs = toFsPath(this.vaultRoot, p);
    if (mode === "replace") {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, "utf8");
    } else {
      const prev = await fs.readFile(abs, "utf8").catch(() => "");
      await fs.writeFile(abs, prev + content, "utf8");
    }
    return { path: p };
  }

  async deleteNote(relPath: string): Promise<void> {
    this.assertOpen();
    const p = ensureMdExtension(relPath);
    const abs = toFsPath(this.vaultRoot, p);
    await fs.unlink(abs);
  }

  /** Resolve wiki target (e.g. "My Note" or "folder/My Note") to vault-relative .md path, or null. */
  async resolveWikiTarget(target: string): Promise<string | null> {
    this.assertOpen();
    const notes = await this.listNotes();
    const t = target.trim();
    const asMd = t.toLowerCase().endsWith(".md") ? t : `${t}.md`;

    // Exact path match (case-insensitive on common FS)
    for (const n of notes) {
      if (n.path.toLowerCase() === asMd.toLowerCase()) return n.path;
    }
    // Match by title (filename without .md)
    const lower = t.toLowerCase();
    const byTitle = notes.filter((n) => titleFromPath(n.path).toLowerCase() === lower);
    if (byTitle.length === 1) return byTitle[0].path;
    // Unique basename
    const byBase = notes.filter((n) => path.basename(n.path, ".md").toLowerCase() === lower);
    if (byBase.length === 1) return byBase[0].path;
    return null;
  }

  async listBacklinks(relPath: string): Promise<NoteMeta[]> {
    this.assertOpen();
    const target = ensureMdExtension(relPath);
    const notes = await this.listNotes();
    const backlinks: NoteMeta[] = [];

    for (const n of notes) {
      if (n.path === target) continue;
      const { content } = await this.readNote(n.path);
      const links = extractWikiTargets(content);
      for (const link of links) {
        const resolved = await this.resolveWikiTarget(link);
        if (resolved === target) {
          backlinks.push({ path: n.path, title: titleFromPath(n.path) });
          break;
        }
      }
    }
    return backlinks;
  }

  async searchNotes(query: string, limit: number): Promise<SearchHit[]> {
    this.assertOpen();
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    const notes = await this.listNotes();
    const hits: SearchHit[] = [];

    for (const n of notes) {
      const { content } = await this.readNote(n.path);
      const hay = content.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (!hay.includes(t)) {
          score = 0;
          break;
        }
        let idx = 0;
        while (idx < hay.length) {
          const found = hay.indexOf(t, idx);
          if (found === -1) break;
          score += 3;
          idx = found + t.length;
        }
      }
      if (score <= 0) continue;
      const snippet = this.snippet(content, terms[0] ?? q, 160);
      hits.push({ path: n.path, score, snippet });
    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, Math.max(1, limit));
  }

  private snippet(text: string, needle: string, maxLen: number): string {
    const lower = text.toLowerCase();
    const i = lower.indexOf(needle.toLowerCase());
    if (i === -1) return text.slice(0, maxLen).replace(/\s+/g, " ").trim();
    const pad = 40;
    const start = Math.max(0, i - pad);
    const end = Math.min(text.length, i + needle.length + pad);
    let s = text.slice(start, end).replace(/\s+/g, " ").trim();
    if (s.length > maxLen) s = s.slice(0, maxLen) + "…";
    return s;
  }

  /** Create stub note if missing; return path. */
  async openOrCreateFromWiki(target: string): Promise<string> {
    this.assertOpen();
    const existing = await this.resolveWikiTarget(target);
    if (existing) return existing;
    const rel = ensureMdExtension(target.replace(/\\/g, "/"));
    await this.createNote(rel, `# ${titleFromPath(rel)}\n\n`);
    return rel;
  }
}
