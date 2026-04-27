const WIKI_LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function extractWikiTargets(markdown: string): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(WIKI_LINK)) {
    const raw = m[1]?.trim();
    if (raw) out.push(raw);
  }
  return out;
}

/** Display title from path: "folder/Note.md" -> "Note" */
export function titleFromPath(relPath: string): string {
  const base = relPath.split("/").pop() ?? relPath;
  return base.replace(/\.md$/i, "");
}
