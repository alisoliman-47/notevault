/** Turn Obsidian-style [[links]] into markdown links for preview. */
export function wikiLinksToMarkdown(md: string): string {
  return md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, label?: string) => {
    const t = String(target).trim();
    const display = (label ?? target).trim();
    return `[${display}](wiki:${encodeURIComponent(t)})`;
  });
}
