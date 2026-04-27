const API = "";

export interface NoteMeta {
  path: string;
  title: string;
}

export interface ReadNote {
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

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = (body as { error?: string }).error ?? res.statusText;
    throw new Error(err);
  }
  return res.json() as Promise<T>;
}

export async function openVault(absPath: string): Promise<{ root: string; noteCount: number }> {
  return j(
    await fetch(`${API}/api/vault`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: absPath }),
    }),
  );
}

export async function listNotes(): Promise<NoteMeta[]> {
  return j(await fetch(`${API}/api/notes`));
}

export async function readNote(path: string): Promise<ReadNote> {
  const q = new URLSearchParams({ path });
  return j(await fetch(`${API}/api/note?${q}`));
}

export async function createNote(path: string, content: string): Promise<{ path: string }> {
  return j(
    await fetch(`${API}/api/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    }),
  );
}

export async function updateNote(
  path: string,
  content: string,
  mode: "replace" | "append" = "replace",
): Promise<{ path: string }> {
  return j(
    await fetch(`${API}/api/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content, mode }),
    }),
  );
}

export async function deleteNote(path: string): Promise<void> {
  const q = new URLSearchParams({ path });
  const res = await fetch(`${API}/api/note?${q}`, { method: "DELETE" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? res.statusText);
}

export async function searchNotes(q: string, limit = 10): Promise<SearchHit[]> {
  const p = new URLSearchParams({ q, limit: String(limit) });
  return j(await fetch(`${API}/api/search?${p}`));
}

export async function listBacklinks(path: string): Promise<NoteMeta[]> {
  const p = new URLSearchParams({ path });
  return j(await fetch(`${API}/api/backlinks?${p}`));
}

export async function openWikiTarget(target: string): Promise<{ path: string }> {
  return j(
    await fetch(`${API}/api/wiki/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    }),
  );
}
